#!/bin/bash
# Fox Davidson Property Mortgage MCP — smoke test both tools end-to-end.
# Uses node (guaranteed present, it's an MCP server) to parse responses.
# Run from the fd-mcp folder: ./smoke-test.sh

set -e
cd "$(dirname "$0")"

if [ ! -d "dist" ]; then
  echo "dist/ missing. Run: npm install && npm run build"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 'node' not on PATH. Install Node.js from nodejs.org or via brew install node"
  exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  FOX DAVIDSON PROPERTY MORTGAGE MCP — SMOKE TEST"
echo "  Node: $(node --version)"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Pipe init + initialized + a tool call into the stdio server, return the id:2 line
run_mcp() {
  printf '%s\n%s\n%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    "$1" \
    | node dist/index-stdio.js 2>/dev/null | grep '"id":2'
}

# Extract a dotted path from result.structuredContent of the id:2 line
get() {
  node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const o=JSON.parse(s.trim());
      const sc=o.result.structuredContent;
      const path=process.argv[1].split(".");
      let v=sc; for(const k of path){v=v?.[k];}
      console.log(typeof v==="object"?JSON.stringify(v):v);
    });' "$2" <<<"$1"
}

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "    ✓ $1 = $2"; else FAIL=$((FAIL+1)); echo "    ✗ $1 EXPECTED $3 GOT $2"; fi; }

echo "─── Test 0: tools/list (expect 2 tools) ───────────────────────"
LIST=$(run_mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
COUNT=$(echo "$LIST" | grep -o '"name":"[a-z_]*"' | wc -l | tr -d ' ')
echo "$LIST" | grep -o '"name":"[a-z_]*"' | sed 's/"name":"\(.*\)"/      • \1/'
check "tool count" "$COUNT" "2"
echo ""

echo "─── Test 1: stamp duty — England GBP 650k additional dwelling ──"
R=$(run_mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"uk_stamp_duty_calculator","arguments":{"property_price_gbp":650000,"region":"england","buyer_type":"additional"}}}')
check "total_tax_gbp" "$(get "$R" result.total_tax_gbp)" "55000"
check "brand" "$(get "$R" _source.brand)" "Fox Davidson"
echo ""

echo "─── Test 2: stamp duty — Scotland GBP 600k additional dwelling ─"
R=$(run_mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"uk_stamp_duty_calculator","arguments":{"property_price_gbp":600000,"region":"scotland","buyer_type":"additional"}}}')
check "total_tax_gbp" "$(get "$R" result.total_tax_gbp)" "81350"
echo ""

echo "─── Test 3: stamp duty — England GBP 500k first-time buyer ─────"
R=$(run_mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"uk_stamp_duty_calculator","arguments":{"property_price_gbp":500000,"region":"england","buyer_type":"ftb"}}}')
check "total_tax_gbp" "$(get "$R" result.total_tax_gbp)" "10000"
echo ""

echo "─── Test 4: HNW single — income GBP 350k (income limb) ─────────"
R=$(run_mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fd_hnw_mortgage_qualification","arguments":{"applicant_1":{"annual_net_income_gbp":350000}}}}')
check "verdict" "$(get "$R" result.verdict)" "Qualifies under MCOB 3A"
check "income_pass" "$(get "$R" result.applicant_1.income_pass)" "true"
echo ""

echo "─── Test 5: HNW single — asset-rich, primary-led net assets ────"
R=$(run_mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fd_hnw_mortgage_qualification","arguments":{"applicant_1":{"annual_net_income_gbp":50000,"primary_residence_value_gbp":4000000,"primary_residence_mortgage_gbp":1000000}}}}')
check "net_assets_gbp" "$(get "$R" result.applicant_1.net_assets_gbp)" "3000000"
check "primary_led" "$(get "$R" result.applicant_1.primary_led_qualification)" "true"
check "qualifies" "$(get "$R" result.applicant_1.qualifies)" "true"
echo ""

echo "─── Test 6: HNW joint — aggregate-only qualification ───────────"
R=$(run_mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fd_hnw_mortgage_qualification","arguments":{"applicant_1":{"annual_net_income_gbp":200000},"applicant_2":{"annual_net_income_gbp":200000}}}}')
check "application_type" "$(get "$R" result.application_type)" "joint"
check "aggregate_income_pass" "$(get "$R" result.joint_household_aggregate.income_pass)" "true"
check "verdict" "$(get "$R" result.verdict)" "Joint household aggregate qualifies (individuals do not)"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  RESULTS: $PASS PASSED, $FAIL FAILED"
echo "════════════════════════════════════════════════════════════════"
echo ""
if [ "$FAIL" -gt 0 ]; then echo "Some tests failed. See output above."; exit 1; fi
echo "✓ MCP working. All tests passed."
