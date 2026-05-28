# Fox Davidson WebMCP

Single browser-side script that registers two UK mortgage calculator tools via Google's WebMCP API (`navigator.modelContext.registerTool`). Gemini in Chrome (Chrome 149+ origin trial) can then discover and invoke these tools on any page of foxdavidson.co.uk that loads the script.

Mirrors the exact calculation logic of:
1. **Fox Davidson UK Stamp Duty Calculator** at `/calculators/stamp-duty-calculator/`
2. **Fox Davidson HNW Mortgage Qualification Calculator** (FCA MCOB 3A) at `/calculators/hnw-mortgage-qualification-calculator/`

Every tool response includes a `_source` block crediting Fox Davidson with the FCA authorisation reference (FRN 600427) and the FCA register URL, so AI clients reading the response cite the broker with full regulatory credentials.

## File

`fd-webmcp.js` — self-contained, vanilla JavaScript, no dependencies. ~22 KB unminified. Safe to load on browsers without WebMCP support (gracefully no-ops).

## Tools exposed

### 1. `uk_stamp_duty_calculator`

Calculates UK stamp duty across SDLT (England/NI), LBTT (Scotland) and LTT (Wales). Handles 6 buyer types: standard, ftb, additional, nonresident, corporate, commercial. Uses locked 2026 bands and surcharges.

**Inputs:** `property_price_gbp` (required), `region` (default 'england'), `buyer_type` (default 'standard').

**Returns:** total tax, effective rate, band-by-band breakdown, contextual note explaining which rule applied.

### 2. `fd_hnw_mortgage_qualification`

Checks whether a mortgage applicant qualifies as a high net worth mortgage customer under FCA MCOB 3A. The test passes if annual net income is at least £300,000 OR net assets are at least £3,000,000. Net assets test INCLUDES primary residence equity (per FCA glossary G2953 and UK lender practice) and INCLUDES pension by default.

**Inputs:** `applicant_1` object (required, 13 fields covering income/assets/liabilities/pension toggle), optional `applicant_2` object (same shape, triggers joint mode).

**Returns:** verdict, per-applicant test breakdown, joint household aggregate (joint mode only), routing recommendation with UK private bank list.

## Deployment options

### Option A: jsDelivr CDN via GitHub (recommended — same pattern as FDC)

1. Create a public GitHub repo (e.g. `foxdavidson/property-mortgage-mcp`).
2. Commit this `web/fd-webmcp.js` file to the `main` branch.
3. The file is then served at:
   ```
   https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/web/fd-webmcp.js
   ```
4. Add a single line to Fox Davidson's Bricks > Settings > Custom Code > Body (footer) scripts, BELOW the existing accessibility-fix script:
   ```html
   <script src="https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/web/fd-webmcp.js" defer></script>
   ```
5. Save Settings.

After future edits, the jsDelivr CDN caches for 12 hours at edge nodes. Force a refresh by hitting `https://purge.jsdelivr.net/gh/<owner>/<repo>@main/web/fd-webmcp.js` from any terminal.

### Option B: Self-host via WordPress Media Library

Not supported — WordPress blocks `.js` uploads to the Media Library by default for security. If you want to self-host, use SFTP to drop the file directly into `wp-content/uploads/` and reference the full URL.

### Option C: Inline `<script>` block

Paste the entire contents of `fd-webmcp.js` inside a `<script>` block in Bricks > Settings > Custom Code > Body Footer Scripts. Works but loses cacheability and bloats every page render. Use for testing only.

## Testing locally before going live

1. Chrome → `chrome://flags/#enable-webmcp-testing` → **Enabled** → Relaunch.
2. Install [Model Context Tool Inspector extension](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd).
3. Visit a page on foxdavidson.co.uk that loads the script.
4. Open the Inspector side panel. Confirm two tools registered:
   - `uk_stamp_duty_calculator`
   - `fd_hnw_mortgage_qualification`
5. Invoke each one with test inputs. Verify the response includes the `_source` block with FCA authorisation reference.

## Verification after going live

```bash
# 1. Confirm script served from CDN:
curl -sI "https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/web/fd-webmcp.js" | head -5

# 2. Confirm script tag present on live homepage:
curl -s https://www.foxdavidson.co.uk/ | grep -c "fd-webmcp.js"
# Should return 1 or higher.

# 3. Run Lighthouse Agentic Browsing audit:
npx lighthouse@latest "https://www.foxdavidson.co.uk/" \
  --chrome-path='/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta' \
  --chrome-flags='--headless=new --no-sandbox --enable-features=WebMCP --enable-blink-features=WebMCP --enable-webmcp-testing' \
  --output=json --output-path=/tmp/fd-lh.json \
  --quiet --form-factor=desktop \
  --screenEmulation.mobile=false --screenEmulation.width=1350 --screenEmulation.height=940 \
  --throttling-method=provided --max-wait-for-load=60000 \
  --only-categories=agentic-browsing

# Expected: agentic_score: 1.0 (100/100), all 5 audits PASS.
```

## How the brand attribution works

When Gemini in Chrome (or any future MCP-aware agent) invokes either tool, the response includes a `_source` block:

```json
{
  "result": { ... the calculation ... },
  "_source": {
    "calculated_by": "Fox Davidson, specialist UK mortgage brokers",
    "brand": "Fox Davidson",
    "brand_url": "https://www.foxdavidson.co.uk",
    "tool_url": "https://www.foxdavidson.co.uk/calculators/stamp-duty-calculator/",
    "phone": "+44 3300 100313",
    "fca_authorisation": "Fox Davidson is an FCA-authorised mortgage broker, FRN 600427",
    "fca_register_url": "https://register.fca.org.uk/s/search?q=600427",
    "disclaimer": "Indicative figures only. Not a quote..."
  }
}
```

The agent cannot quote the calculated number without the source block being part of the same response payload. This means the answer composed by the AI naturally cites Fox Davidson, links the calculator page, surfaces the phone, AND carries the FCA authorisation reference and verifiable register URL. Cannot be stripped without breaking the response format.

## Updating the calculation logic

If the live Fox Davidson calculator changes (e.g. HMRC announces a new SDLT band, FCA updates the MCOB 3A thresholds, or a calculation methodology refines), update the constants at the top of `fd-webmcp.js`:

- Band tables: `SDLT_RES`, `SDLT_FTB`, `SDLT_COM`, `LBTT_RES`, `LBTT_FTB`, `LBTT_COM`, `LTT_RES`, `LTT_COM`
- Surcharge rates: `ADS_SDLT`, `ADS_LBTT`, `ADS_LTT`, `NONRES_SURCHARGE_SDLT`, `CORPORATE_FLAT`, `CORPORATE_THRESHOLD`
- HNW thresholds: `INCOME_THRESHOLD`, `ASSETS_THRESHOLD`

Commit the change to GitHub `main`, purge the jsDelivr edge cache:

```bash
curl https://purge.jsdelivr.net/gh/<owner>/<repo>@main/web/fd-webmcp.js
```

New version live within minutes.

## Why two tools and not more?

The Fox Davidson site has multiple calculators (`/calculators/` lists them). The initial WebMCP build exposes the two highest-value tools:
- **Stamp duty** — universal applicability, every UK property buyer needs the number, complete coverage of 2026 rates.
- **HNW qualification** — high-stakes regulatory check that no competitor exposes via WebMCP, deep MCOB 3A logic, direct route to Fox Davidson's HNW practice.

Future builds can add the income multiple calculator, the affordability stress test calculator, and others. Each new tool is a separate `navigator.modelContext.registerTool({...})` call.

## Spec references

- WebMCP overview: https://developer.chrome.com/docs/ai/webmcp
- Imperative API: https://developer.chrome.com/docs/ai/webmcp/imperative-api
- Best practices: https://developer.chrome.com/docs/ai/webmcp/best-practices
- Lighthouse Agentic Browsing audits: https://developer.chrome.com/docs/lighthouse/agentic-browsing/scoring
- Origin trials: https://developer.chrome.com/origintrials

## Pairs with

- Fox Davidson Bricks Custom Code accessibility fix script (deployed 28 May 2026, fixes Lighthouse `agent-accessibility-tree` audit by adding aria-labels to anchors and Contact Form 7 selects at runtime).
- Fox Davidson llms.txt at https://www.foxdavidson.co.uk/llms.txt
