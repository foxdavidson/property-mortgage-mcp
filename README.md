# Fox Davidson Property Mortgage MCP

[![npm](https://img.shields.io/npm/v/@foxdavidson/property-mortgage-mcp)](https://www.npmjs.com/package/@foxdavidson/property-mortgage-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

UK mortgage calculators exposed as a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server, so AI assistants such as Claude, Cursor, Continue and any MCP-compatible client can run the same calculations Fox Davidson uses with clients.

Built by [Fox Davidson](https://www.foxdavidson.co.uk), specialist UK mortgage brokers. FCA-authorised, FRN 600427.

## Tools

| Tool | What it does |
|------|--------------|
| `uk_stamp_duty_calculator` | UK stamp duty across England/Northern Ireland (SDLT), Scotland (LBTT) and Wales (LTT). Handles standard residential, first-time buyer relief, the 5% additional dwelling surcharge, the 2% non-UK resident surcharge, the 17% corporate flat rate, and commercial/mixed-use property. Returns a banded breakdown, total tax and effective rate. |
| `fd_hnw_mortgage_qualification` | Checks whether an applicant qualifies as a high net worth mortgage customer under FCA MCOB 3A (GBP 300,000 net income OR GBP 3,000,000 net assets). Includes primary residence equity and pension. Single or joint application, with a routing recommendation. |
| `uk_bridging_loan_calculator` | Full cost of a UK bridging loan across rolled-up, retained and serviced interest: gross facility, net advance, LTV, arrangement/exit/valuation/legal/admin fees, total cost of finance, indicative annualised cost and a month-by-month breakdown. Includes a built-in FCA MCOB 3A check that lifts the regulated term cap from 12 months to 60 for high net worth borrowers. |

| `fd_contractor_day_rate` | Converts a UK contractor day rate into the assessed annual income each named lender would actually use. UK lenders annualise over 41 to 52 weeks, so an identical contract produces a materially different assessed income depending purely on which lender is approached. Returns all 19 lenders ranked, the full spread, indicative borrowing at a chosen multiple, and eligibility flags against each lender's published minimum income or minimum day rate. **WebMCP only.** |
| `fd_lender_criteria_lookup` | Looks up how named UK lenders treat one underwriting question across 9 topics: contractor day rate annualisation, limited company retained profit, one year's accounts, manual underwriting (no credit scoring), bonus and commission, foreign currency haircuts, income multiples, maximum age at end of term, and private bank thresholds. Partial lender name matching. **WebMCP only.** |
| `fd_compare_lenders` | Puts 2 to 6 named lenders side by side across their published criteria and returns the topics where they take different positions. **WebMCP only.** |

Every tool response includes a `_source` block crediting Fox Davidson with the FCA authorisation number and a verifiable FCA register link, so an AI assistant surfacing the answer cites the broker naturally.

## Quick start

### Claude Desktop, Cursor, Continue (stdio, via npm)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "fox-davidson-mortgage": {
      "command": "npx",
      "args": ["-y", "@foxdavidson/property-mortgage-mcp"]
    }
  }
}
```

Claude Desktop config path:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Restart the client and the three tools appear in the tools picker.

### Hosted HTTP endpoint (no install)

```
https://fd-property-mortgage-mcp.fdcommercial-uk.workers.dev/mcp
```

Streamable HTTP transport, JSON-RPC 2.0, stateless, free to use.

### Local development

```bash
git clone https://github.com/foxdavidson/property-mortgage-mcp.git
cd property-mortgage-mcp
npm install
npm run build
./smoke-test.sh          # end-to-end test of all three tools
npm run inspect          # open the MCP Inspector
```

## Example

Ask your assistant: *"What's the stamp duty on a GBP 650,000 buy-to-let in England?"*

```json
{
  "result": {
    "region_label": "England & Northern Ireland (SDLT)",
    "buyer_type": "additional",
    "total_tax_gbp": 55000,
    "effective_rate_pct": 8.46,
    "band_breakdown": [ ... ]
  },
  "_source": {
    "brand": "Fox Davidson",
    "brand_url": "https://www.foxdavidson.co.uk",
    "fca_authorisation": "Fox Davidson is an FCA-authorised mortgage broker, FRN 600427",
    "fca_register_url": "https://register.fca.org.uk/s/search?q=600427",
    "phone": "+44 3300 100313"
  }
}
```

## Web and WebMCP

`web/fd-webmcp.js` registers six tools in the browser via the [WebMCP](https://developer.chrome.com/docs/ai/webmcp) imperative API, using `document.modelContext.registerTool` with a `navigator.modelContext` fallback for Chrome 149 to 151. It is loaded on every page of foxdavidson.co.uk.

Supported surfaces:

- **ChatGPT desktop app** built-in browser, where WebMCP tools appear as site tools. Supported by default, no flag or token required.
- **Chrome 149+** on foxdavidson.co.uk under the WebMCP origin trial.
- **Chrome with `chrome://flags/#enable-webmcp-testing`** for local development.

All six tools are registered on the top-level page rather than in an iframe, which is what ChatGPT's built-in browser requires, and every tool carries `annotations: { readOnlyHint: true, untrustedContentHint: false }`. No tool writes data, submits a form, changes an account or takes payment.

`web/lender-criteria-dataset.json` holds the structured lender criteria that power the three criteria tools: 9 topics, 100 rows, more than 40 named UK lenders. Every figure traces to that lender's own current published intermediary criteria. Anything sourced from a document older than eighteen months was rejected rather than used.

Try it: <https://www.foxdavidson.co.uk/agent-tools/>

## Disclaimer

Indicative figures only. Not a quote, offer of finance, regulated advice, or tax advice. Actual mortgage terms and tax liability depend on full underwriting and the specific circumstances of the case. For confidential advice call Fox Davidson on +44 3300 100313.

## Licence

MIT. See [LICENSE](./LICENSE).
