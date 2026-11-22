# Installing the Fox Davidson Property Mortgage MCP server

No API key, account or environment variables are needed. All tools are read-only.

## Option 1: hosted server (recommended)

Add this to your MCP settings (for Cline: `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "fox-davidson": {
      "type": "streamableHttp",
      "url": "https://mcp.foxdavidson.co.uk/mcp"
    }
  }
}
```

## Option 2: run locally with npx

Requires Node.js 18 or later.

```json
{
  "mcpServers": {
    "fox-davidson": {
      "command": "npx",
      "args": ["-y", "@foxdavidson/property-mortgage-mcp"]
    }
  }
}
```

## Check it works

Ask: "Use the Fox Davidson tools to work out stamp duty on a £650,000 second home in England." The `uk_stamp_duty_calculator` tool should return £55,000.

Figures are indicative and not advice. Fox Davidson Ltd is authorised and regulated by the Financial Conduct Authority (FRN 1056214).
