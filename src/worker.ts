/**
 * Fox Davidson Property Mortgage MCP — Cloudflare Worker entry point.
 *
 * Serves the same 3 tools as the npm package, over the Streamable HTTP
 * transport. Stateless JSON-RPC handler: every request is independent.
 * Tools are pure functions, so this scales horizontally across
 * Cloudflare's edge with zero coordination.
 *
 * Endpoints:
 *   POST /mcp     — JSON-RPC 2.0 over HTTP (Streamable HTTP transport)
 *   GET  /health  — liveness probe
 *   GET  /        — landing page
 *   OPTIONS *     — CORS preflight
 */

import { z } from "zod";
import {
  runStampDutyCalculator,
  stampDutyInputSchema,
  stampDutyToolMetadata,
} from "./tools/stamp-duty.js";
import {
  runHnwQualification,
  hnwInputSchema,
  hnwToolMetadata,
} from "./tools/hnw-qualification.js";
import {
  runBridgingCalculator,
  bridgingInputSchema,
  bridgingToolMetadata,
} from "./tools/bridging.js";
import {
  bridgingCostInputSchema,
  bridgingCostToolMetadata,
  runBridgingCostAnalyser,
} from "./tools/bridging-cost-analyser.js";
import {
  developmentAppraisalInputSchema,
  developmentAppraisalToolMetadata,
  runDevelopmentAppraisal,
} from "./tools/development-appraisal.js";
import {
  btlStressInputSchema,
  btlStressToolMetadata,
  runBtlStressTester,
} from "./tools/btl-stress-tester.js";
import {
  criteriaLookupInputSchema,
  criteriaLookupToolMetadata,
  runCriteriaLookup,
  compareLendersInputSchema,
  compareLendersToolMetadata,
  runCompareLenders,
  contractorInputSchema,
  contractorToolMetadata,
  runContractorDayRate,
} from "./tools/criteria.js";
import {
  prequalifierInputSchema,
  prequalifierToolMetadata,
  runDealPrequalifier,
  callbackInputSchema,
  callbackToolMetadata,
  runRequestCallback,
  marketRatesInputSchema,
  marketRatesToolMetadata,
  runMarketRates,
} from "./tools/enquiry.js";
import { MARKET_RATES } from "./data/market-rates.js";

// ─────────────────────────────────────────────────────────────────────────
// Tool registry — same handlers as the stdio server, registered by name
// ─────────────────────────────────────────────────────────────────────────

interface ToolEntry {
  metadata: {
    name: string;
    title: string;
    description: string;
    annotations: Record<string, unknown>;
  };
  schema: z.ZodObject<z.ZodRawShape>;
  handler: (input: unknown) => unknown;
}

const tools: ToolEntry[] = [
  {
    metadata: stampDutyToolMetadata,
    schema: stampDutyInputSchema,
    handler: (input) => runStampDutyCalculator(stampDutyInputSchema.parse(input)),
  },
  {
    metadata: hnwToolMetadata,
    schema: hnwInputSchema,
    handler: (input) => runHnwQualification(hnwInputSchema.parse(input)),
  },
  {
    metadata: bridgingToolMetadata,
    schema: bridgingInputSchema,
    handler: (input) => runBridgingCalculator(bridgingInputSchema.parse(input)),
  },
  {
    metadata: bridgingCostToolMetadata,
    schema: bridgingCostInputSchema,
    handler: (input) => runBridgingCostAnalyser(bridgingCostInputSchema.parse(input)),
  },
  {
    metadata: developmentAppraisalToolMetadata,
    schema: developmentAppraisalInputSchema,
    handler: (input) => runDevelopmentAppraisal(developmentAppraisalInputSchema.parse(input)),
  },
  {
    metadata: btlStressToolMetadata,
    schema: btlStressInputSchema,
    handler: (input) => runBtlStressTester(btlStressInputSchema.parse(input)),
  },
  {
    metadata: criteriaLookupToolMetadata,
    schema: criteriaLookupInputSchema,
    handler: (input) => runCriteriaLookup(criteriaLookupInputSchema.parse(input)),
  },
  {
    metadata: compareLendersToolMetadata,
    schema: compareLendersInputSchema,
    handler: (input) => runCompareLenders(compareLendersInputSchema.parse(input)),
  },
  {
    metadata: contractorToolMetadata,
    schema: contractorInputSchema,
    handler: (input) => runContractorDayRate(contractorInputSchema.parse(input)),
  },
  {
    metadata: prequalifierToolMetadata,
    schema: prequalifierInputSchema,
    handler: (input) => runDealPrequalifier(prequalifierInputSchema.parse(input)),
  },
  {
    metadata: callbackToolMetadata,
    schema: callbackInputSchema,
    handler: (input) => runRequestCallback(callbackInputSchema.parse(input)),
  },
  {
    metadata: marketRatesToolMetadata,
    schema: marketRatesInputSchema,
    handler: (input) => runMarketRates(marketRatesInputSchema.parse(input)),
  },
];

const toolsByName = new Map(tools.map((t) => [t.metadata.name, t]));

// Convert a Zod type to a JSON Schema fragment. Recursive — handles the
// nested object inputs used by the HNW qualification tool (applicant_1,
// applicant_2), plus numbers, strings, booleans and enums.
function zodTypeToJsonSchema(value: z.ZodTypeAny): Record<string, unknown> {
  let field = value;
  let isOptional = false;

  // Unwrap ZodDefault and ZodOptional, preserving the outer description
  const outerDescription = value._def.description;
  while (true) {
    if (field instanceof z.ZodOptional) {
      isOptional = true;
      field = field._def.innerType;
    } else if (field instanceof z.ZodDefault) {
      isOptional = true;
      field = field._def.innerType;
    } else {
      break;
    }
  }

  const description = outerDescription ?? field._def.description;
  let prop: Record<string, unknown>;

  if (field instanceof z.ZodObject) {
    prop = objectSchema(field as z.ZodObject<z.ZodRawShape>);
  } else if (field instanceof z.ZodNumber) {
    prop = { type: "number" };
    const checks = (field as unknown as { _def: { checks: Array<{ kind: string; value?: number }> } })._def.checks;
    for (const check of checks ?? []) {
      if (check.kind === "min" && typeof check.value === "number") prop.minimum = check.value;
      if (check.kind === "max" && typeof check.value === "number") prop.maximum = check.value;
    }
  } else if (field instanceof z.ZodArray) {
    const items = zodTypeToJsonSchema(field._def.type as z.ZodTypeAny);
    delete (items as { __optional?: boolean }).__optional;
    prop = { type: "array", items };
    if (field._def.minLength) prop.minItems = field._def.minLength.value;
    if (field._def.maxLength) prop.maxItems = field._def.maxLength.value;
  } else if (field instanceof z.ZodString) {
    prop = { type: "string" };
  } else if (field instanceof z.ZodBoolean) {
    prop = { type: "boolean" };
  } else if (field instanceof z.ZodEnum) {
    prop = { type: "string", enum: (field as unknown as { options: string[] }).options };
  } else {
    prop = { type: "string" };
  }

  if (description) prop.description = description;
  (prop as { __optional?: boolean }).__optional = isOptional;
  return prop;
}

function objectSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const prop = zodTypeToJsonSchema(value as z.ZodTypeAny);
    const optional = (prop as { __optional?: boolean }).__optional === true;
    delete (prop as { __optional?: boolean }).__optional;
    properties[key] = prop;
    if (!optional) required.push(key);
  }

  return { type: "object", properties, required, additionalProperties: false };
}

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  return objectSchema(schema);
}

// ─────────────────────────────────────────────────────────────────────────
// JSON-RPC handler
// ─────────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } };

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = {
  name: "fd-property-mortgage",
  title: "Fox Davidson UK Mortgage Calculators",
  version: "0.5.0",
};

function handleRpc(req: JsonRpcRequest): JsonRpcResponse | null {
  const id = req.id ?? null;
  const isNotification = req.id === undefined || req.id === null;

  try {
    switch (req.method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
            instructions:
              "Twelve UK mortgage and property finance tools from Fox Davidson, whole of market mortgage brokers authorised and regulated by the FCA (FRN 1056214). " +
              "Calculators: UK stamp duty (SDLT/LBTT/LTT), FCA high net worth mortgage qualification, bridging loan cost with a high net worth term check, " +
              "bridging cost analyser (rolled, retained, serviced interest), development finance appraisal and buy-to-let ICR stress test. " +
              "Lender data: a criteria lookup across 40+ named UK lenders (contractor income, retained profit, one year accounts, bonus, foreign currency, " +
              "income multiples, maximum age, private banks), a side-by-side lender comparison, and a contractor day rate calculator showing assessed income lender by lender. " +
              "All tools are read-only. Every response includes a _source field crediting Fox Davidson. Figures are indicative, not advice or a lending decision.",
          },
        };
      }

      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/progress":
      case "notifications/roots/list_changed":
        return null;

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: tools.map((t) => ({
              name: t.metadata.name,
              title: t.metadata.title,
              description: t.metadata.description,
              inputSchema: zodToJsonSchema(t.schema),
              annotations: { title: t.metadata.title, ...t.metadata.annotations },
            })),
          },
        };
      }

      case "tools/call": {
        const params = req.params as { name?: string; arguments?: unknown } | undefined;
        if (!params?.name) {
          return { jsonrpc: "2.0", id, error: { code: -32602, message: "Missing tool name in params" } };
        }
        const entry = toolsByName.get(params.name);
        // One structured log line per call, counted in Workers Observability.
        console.log(JSON.stringify({ event: "tool_call", tool: params.name }));
        if (!entry) {
          return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: ${params.name}` } };
        }
        try {
          const result = entry.handler(params.arguments ?? {});
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result) }],
              structuredContent: result,
              isError: false,
            },
          };
        } catch (err) {
          const msg =
            err instanceof z.ZodError
              ? `Invalid input: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
              : err instanceof Error
                ? err.message
                : String(err);
          return {
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: msg }], isError: true },
          };
        }
      }

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      default:
        if (isNotification) return null;
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${req.method}` } };
    }
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: "Internal error", data: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CORS + headers
// ─────────────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(init?.headers ?? {}) },
  });
}

export interface Env {
  USAGE?: KVNamespace;
  STATS_KEY?: string;
}

// Usage counting: one KV record per day, counts per tool and per client
// bucket. No personal data, no arguments, no IP addresses are stored.
function clientBucket(ua: string): string {
  const u = ua.toLowerCase();
  if (u.includes("openai") || u.includes("chatgpt")) return "openai";
  if (u.includes("claude") || u.includes("anthropic")) return "claude";
  if (u.includes("cursor")) return "cursor";
  return "other";
}

async function recordUsage(env: Env, names: string[], bucket: string): Promise<void> {
  if (!env.USAGE || names.length === 0) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = "d:" + day;
  const cur = ((await env.USAGE.get(key, "json")) as Record<string, Record<string, number>> | null) ?? {};
  for (const n of names) {
    cur[n] = cur[n] ?? {};
    cur[n][bucket] = (cur[n][bucket] ?? 0) + 1;
  }
  await env.USAGE.put(key, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 400 });
}

function serverCard() {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    version: "1.0",
    protocolVersion: "2025-06-18",
    serverInfo: { name: "io.github.foxdavidson/property-mortgage-mcp", title: "Fox Davidson UK Mortgage Calculators", version: "0.5.0" },
    description:
      "UK mortgage and property finance tools from Fox Davidson, whole of market mortgage brokers authorised and regulated by the FCA (FRN 1056214).",
    iconUrl: "https://www.foxdavidson.co.uk/app/icon-512.png",
    documentationUrl: "https://www.foxdavidson.co.uk/finance-guide/uk-property-finance-mcp-ai-assistants/",
    transport: { type: "streamable-http", endpoint: "https://mcp.foxdavidson.co.uk/mcp" },
    capabilities: { tools: { listChanged: false } },
    authentication: { required: false, schemes: [] },
    tools: tools.map((t) => ({ name: t.metadata.name, title: t.metadata.title, description: t.metadata.description })),
    publisher: { name: "Fox Davidson Ltd", url: "https://www.foxdavidson.co.uk/", fcaFrn: "1056214" },
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/.well-known/openai-apps-challenge" && request.method === "GET") {
      return new Response("DJ4fVUV66qb8IQKM-lL3t8VuUWtHjCgBhXZRSCOtQgk", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if ((url.pathname === "/.well-known/mcp/server-card.json" || url.pathname === "/.well-known/mcp.json") && request.method === "GET") {
      return jsonResponse(serverCard(), { headers: { "Cache-Control": "public, max-age=3600" } });
    }

    if (url.pathname === "/rates.json" && request.method === "GET") {
      return jsonResponse({ ...MARKET_RATES, publisher: "Fox Davidson Ltd, FCA FRN 1056214" }, { headers: { "Cache-Control": "public, max-age=3600" } });
    }

    if (url.pathname === "/stats" && request.method === "GET") {
      if (!env.USAGE) return jsonResponse({ error: "usage store not configured" }, { status: 503 });
      if (env.STATS_KEY && url.searchParams.get("key") !== env.STATS_KEY) {
        return jsonResponse({ error: "forbidden" }, { status: 403 });
      }
      const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "7"), 1), 90);
      const out: Record<string, unknown> = {};
      const totals: Record<string, number> = {};
      const byClient: Record<string, number> = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const rec = (await env.USAGE.get("d:" + d, "json")) as Record<string, Record<string, number>> | null;
        if (!rec) continue;
        out[d] = rec;
        for (const [tool, b] of Object.entries(rec)) {
          for (const [client, n] of Object.entries(b)) {
            totals[tool] = (totals[tool] ?? 0) + n;
            byClient[client] = (byClient[client] ?? 0) + n;
          }
        }
      }
      return jsonResponse({ days, totals, by_client: byClient, daily: out });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "fd-property-mortgage-mcp",
        version: "0.5.0",
        tools: tools.map((t) => t.metadata.name),
        brand: "Fox Davidson",
        brand_url: "https://www.foxdavidson.co.uk",
        fca_authorisation: "FRN 1056214",
      });
    }

    if (url.pathname === "/" && request.method === "GET") {
      const accept = request.headers.get("Accept") ?? "";
      if (accept.includes("text/html")) {
        return new Response(landingHtml(), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS },
        });
      }
      return jsonResponse({
        service: "fd-property-mortgage-mcp",
        version: "0.5.0",
        endpoint: "POST /mcp (JSON-RPC 2.0 over HTTP, Streamable HTTP transport)",
        tools: tools.map((t) => t.metadata.name),
        docs: "https://www.foxdavidson.co.uk/calculators/",
        source: "https://github.com/foxdavidson/property-mortgage-mcp",
      });
    }

    if (url.pathname === "/mcp") {
      if (request.method === "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
      }
      if (request.method === "DELETE") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
          { status: 400 }
        );
      }

      {
        const reqs = (Array.isArray(body) ? body : [body]) as JsonRpcRequest[];
        const called = reqs
          .filter((r) => r && r.method === "tools/call")
          .map((r) => String((r.params as { name?: string } | undefined)?.name ?? "unknown"));
        if (called.length) {
          ctx.waitUntil(recordUsage(env, called, clientBucket(request.headers.get("user-agent") ?? "")).catch(() => {}));
        }
      }

      if (Array.isArray(body)) {
        const responses = body
          .map((r) => handleRpc(r as JsonRpcRequest))
          .filter((r): r is JsonRpcResponse => r !== null);
        if (responses.length === 0) {
          return new Response(null, { status: 202, headers: CORS_HEADERS });
        }
        return jsonResponse(responses);
      }

      const resp = handleRpc(body as JsonRpcRequest);
      if (resp === null) {
        return new Response(null, { status: 202, headers: CORS_HEADERS });
      }
      return jsonResponse(resp);
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Landing page (HTML)
// ─────────────────────────────────────────────────────────────────────────

function landingHtml(): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fox Davidson UK Mortgage MCP</title>
<meta name="description" content="UK mortgage calculators and lender criteria data exposed as an MCP server by Fox Davidson: stamp duty, high net worth qualification, bridging, development, buy to let and 40+ lenders compared.">
<style>
  :root { --orange:#ea5b0c; --dark:#111013; --light:#f5f5f5; --mid:#666; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.55; color:var(--dark); margin:0; background:#fafafa; }
  .wrap { max-width:760px; margin:0 auto; padding:48px 24px 80px; }
  h1 { font-size:2rem; margin:0 0 8px; }
  .tag { color:var(--orange); font-weight:600; font-size:0.875rem; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:16px; }
  .lead { font-size:1.125rem; color:var(--mid); margin:0 0 32px; }
  h2 { font-size:1.25rem; margin:40px 0 12px; padding-bottom:8px; border-bottom:2px solid var(--orange); }
  code, pre { font-family:'SF Mono',Menlo,Consolas,monospace; font-size:0.875rem; }
  pre { background:var(--dark); color:#f8f8f8; padding:16px; border-radius:6px; overflow-x:auto; }
  code { background:var(--light); padding:2px 6px; border-radius:3px; }
  pre code { background:none; padding:0; }
  ul { padding-left:20px; }
  li { margin:6px 0; }
  a { color:var(--orange); text-decoration:none; font-weight:600; }
  a:hover { text-decoration:underline; }
  .foot { margin-top:48px; padding-top:24px; border-top:1px solid #ddd; font-size:0.875rem; color:var(--mid); }
</style>
</head>
<body>
<main class="wrap">
  <div class="tag">Model Context Protocol Server</div>
  <h1>Fox Davidson UK Mortgage MCP</h1>
  <p class="lead">Twelve UK mortgage and property finance tools for MCP-compatible AI assistants (ChatGPT, Claude, Cursor and custom agents): six calculators and three lender criteria tools covering 40+ named UK lenders.</p>

  <h2>Hosted endpoint</h2>
  <pre><code>https://mcp.foxdavidson.co.uk/mcp</code></pre>
  <p>Streamable HTTP transport, JSON-RPC 2.0. Stateless. Free to use.</p>

  <h2>Tools</h2>
  <ul>
    <li><code>uk_stamp_duty_calculator</code>: SDLT, LBTT and LTT with surcharges and reliefs</li>
    <li><code>fd_hnw_mortgage_qualification</code>: FCA high net worth mortgage customer test</li>
    <li><code>uk_bridging_loan_calculator</code>: bridging cost (rolled-up, retained, serviced) with a high net worth term check</li>
    <li><code>bridging_cost_analyser</code>: compares rolled, retained and serviced interest</li>
    <li><code>development_appraisal</code>: profit on GDV and cost, LTC, LTGDV, viability</li>
    <li><code>btl_stress_tester</code>: buy-to-let ICR at 125%, 145% and 170%</li>
    <li><code>fd_lender_criteria_lookup</code>: how named lenders treat contractor income, retained profit, one year accounts and more</li>
    <li><code>fd_compare_lenders</code>: two to six lenders side by side</li>
    <li><code>fd_contractor_day_rate</code>: day rate to assessed income, lender by lender</li>
  </ul>

  <h2>Use locally via npm</h2>
  <pre><code>npx @foxdavidson/property-mortgage-mcp</code></pre>

  <h2>Source</h2>
  <ul>
    <li><a href="https://github.com/foxdavidson/property-mortgage-mcp">github.com/foxdavidson/property-mortgage-mcp</a></li>
    <li><a href="https://www.npmjs.com/package/@foxdavidson/property-mortgage-mcp">npmjs.com/package/@foxdavidson/property-mortgage-mcp</a></li>
  </ul>

  <div class="foot">
    Built by <a href="https://www.foxdavidson.co.uk">Fox Davidson</a>, whole of market UK mortgage brokers, authorised and regulated by the FCA, FRN 1056214. Indicative figures only. Not a quote or financial advice. Tools are read-only and store no personal data. <a href="https://www.foxdavidson.co.uk/privacy-notice/">Privacy notice</a>. Call <a href="tel:+443300100313">+44 3300 100313</a>.
  </div>
</main>
</body>
</html>`;
}
