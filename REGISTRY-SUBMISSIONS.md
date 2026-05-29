# Fox Davidson MCP — Registry Submission Pack

Mirror of the FDC 19 May launch. Goal: list `@foxdavidson/property-mortgage-mcp`
across the MCP ecosystem with a direct backlink to foxdavidson.co.uk on every one.
Fox Davidson is DR 24 (vs FDC DR ~4.6), so these compound higher existing authority.

Canonical identifiers:
- npm: `@foxdavidson/property-mortgage-mcp`
- GitHub: https://github.com/foxdavidson/property-mortgage-mcp
- Hosted endpoint: https://fd-property-mortgage-mcp.fdcommercial-uk.workers.dev/mcp
- MCP namespace: `io.github.foxdavidson/property-mortgage-mcp`
- Website backlink target: https://www.foxdavidson.co.uk/calculators/

## Standard listing copy

Name: Fox Davidson Property Mortgage MCP
Short: UK mortgage calculators (stamp duty SDLT/LBTT/LTT + FCA MCOB 3A high net worth qualification) from Fox Davidson, FCA-authorised mortgage brokers.
Tags: mcp, uk-mortgage, stamp-duty, sdlt, lbtt, ltt, high-net-worth, mcob-3a, mortgage-broker

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

`mcp-publisher` CLI (Go binary from github.com/modelcontextprotocol/registry/releases).
Auth via GitHub PAT: `mcp-publisher login github --token <PAT>` then `mcp-publisher publish`.
Uses server.json (already in repo, schema 2025-12-11). websiteUrl carries the backlink.
Requires `mcpName` field in package.json (present). Description must be <= 100 chars (it is).

## 2. Glama (glama.ai)
Auto-discovers from the public GitHub repo once it has a Dockerfile (present) and README.
Two listings result: server listing + connector listing (hosted endpoint). Both index the
repo homepage field (foxdavidson.co.uk).

## 3. Smithery (smithery.ai/new)
Submit hosted URL + namespace + slug `property-mortgage-mcp`. Fill Homepage field with
https://www.foxdavidson.co.uk/calculators/ and the long description with a markdown link.
Lesson from FDC: the Homepage field alone may not render as a scraped backlink — also put
the homepage URL in the GitHub repo's About/description and README so Smithery scrapes it.
smithery.yaml is in the repo.

## 4. mcp.so (github.com/chatmcp/mcpso/issues/new)
Open a submission issue with the full description and all backlinks (GitHub, npm, hosted,
Official Registry, Glama, Smithery, foxdavidson.co.uk/calculators). Awaiting maintainer merge.

## 5. mcp.directory (mcp.directory/submit)
Form auto-pulls metadata from the GitHub repo. Submit repo URL.

## 6. mcpservers.org (mcpservers.org submit form)
Form submission, human curation. Watch for the Slim Tools Chrome extension blocking the
Submit button (cross-extension boundary) — disable it or click Submit manually.

## 7. punkpeye/awesome-mcp-servers (PR)
Add an entry to the Finance & Fintech section with a direct `[Fox Davidson](https://www.foxdavidson.co.uk)`
backlink in the entry text plus the Glama score badge. Fine-grained PATs cannot open PRs
against other accounts' repos — fork + branch + commit via API, then open the PR via the
GitHub web UI (Wes clicks the final button).

## Token notes (from FDC build)
- npm Granular Access Token needs `bypass_2fa: true` for non-interactive `npm publish`.
- Official Registry `mcp-publisher` accepts a GitHub PAT via `login github --token`.
- Revoke npm + GitHub tokens immediately after the run.
