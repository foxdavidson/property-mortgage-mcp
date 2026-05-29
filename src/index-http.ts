/**
 * HTTP ENTRY POINT (streamable HTTP transport, stateless JSON mode)
 *
 * For hosted MCP server deployment on Node platforms. Any MCP client that
 * supports streamable HTTP transport can connect to a public endpoint and
 * use the tools without local install.
 *
 * Local testing:
 *   npm run dev:http
 *   curl -X POST http://localhost:3000/mcp \
 *     -H "Content-Type: application/json" \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
 *
 * For Cloudflare Workers deployment, see src/worker.ts.
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer, SERVER_INFO } from "./server.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, mcp-protocol-version");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.url === "/" || req.url === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
        status: "ok",
        attribution: {
          brand: "Fox Davidson",
          url: "https://www.foxdavidson.co.uk",
          fca: "FRN 600427",
          tools_hub: "https://www.foxdavidson.co.uk/calculators/",
        },
      })
    );
    return;
  }

  if (req.url === "/mcp") {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error handling MCP request: ${msg}\n`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          })
        );
      }
    }
    return;
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Not found", path: req.url }));
}

const httpServer = createServer((req, res) => {
  handleRequest(req, res).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Unhandled error: ${msg}\n`);
  });
});

httpServer.listen(PORT, HOST, () => {
  process.stderr.write(
    `${SERVER_INFO.name} v${SERVER_INFO.version} listening on http://${HOST}:${PORT}/mcp\n` +
      `Health check at http://${HOST}:${PORT}/health\n`
  );
});
