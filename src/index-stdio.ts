#!/usr/bin/env node
/**
 * STDIO ENTRY POINT
 *
 * For local installs via Claude Desktop, Cursor, Continue, and any other
 * MCP client that supports stdio transport. The user adds this server to
 * their client's config (see claude-desktop-config.example.json), the
 * client spawns this process, and they communicate over stdin/stdout.
 *
 * Run via:
 *   node dist/index-stdio.js
 *
 * Or test with MCP Inspector:
 *   npx @modelcontextprotocol/inspector node dist/index-stdio.js
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, SERVER_INFO } from "./server.js";

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is the MCP transport, must stay JSON-RPC clean)
  process.stderr.write(
    `${SERVER_INFO.name} v${SERVER_INFO.version} running on stdio transport\n`
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error in ${SERVER_INFO.name}: ${msg}\n`);
  process.exit(1);
});
