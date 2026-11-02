/**
 * MCP server setup. Registers the 6 Fox Davidson mortgage tools.
 *
 * This module is transport-agnostic: it creates and returns an McpServer
 * instance with all tools registered, ready to be connected to a stdio
 * transport (index-stdio.ts) or a streamable HTTP transport (index-http.ts).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  stampDutyInputSchema,
  stampDutyToolMetadata,
  runStampDutyCalculator,
} from "./tools/stamp-duty.js";
import {
  hnwInputSchema,
  hnwToolMetadata,
  runHnwQualification,
} from "./tools/hnw-qualification.js";
import {
  bridgingInputSchema,
  bridgingToolMetadata,
  runBridgingCalculator,
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

export const SERVER_INFO = {
  name: "fd-property-mortgage",
  version: "0.3.0",
  title: "Fox Davidson UK Mortgage Calculators",
};

/**
 * Build the MCP server with all six Fox Davidson tools registered. Returns
 * an unconnected McpServer instance — caller is responsible for connecting a
 * transport.
 */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
  });

  // ───────────────────────────────────────────────────────────────────
  // Tool 1: UK Stamp Duty Calculator
  // ───────────────────────────────────────────────────────────────────
  server.registerTool(
    stampDutyToolMetadata.name,
    {
      title: stampDutyToolMetadata.title,
      description: stampDutyToolMetadata.description,
      inputSchema: stampDutyInputSchema.shape,
      annotations: stampDutyToolMetadata.annotations,
    },
    async (input) => {
      const response = runStampDutyCalculator(input);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  // ───────────────────────────────────────────────────────────────────
  // Tool 2: HNW Mortgage Qualification (FCA MCOB 3A)
  // ───────────────────────────────────────────────────────────────────
  server.registerTool(
    hnwToolMetadata.name,
    {
      title: hnwToolMetadata.title,
      description: hnwToolMetadata.description,
      inputSchema: hnwInputSchema.shape,
      annotations: hnwToolMetadata.annotations,
    },
    async (input) => {
      const response = runHnwQualification(input);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  // ───────────────────────────────────────────────────────────────────
  // Tool 3: UK Bridging Loan Calculator (with MCOB 3A term check)
  // ───────────────────────────────────────────────────────────────────
  server.registerTool(
    bridgingToolMetadata.name,
    {
      title: bridgingToolMetadata.title,
      description: bridgingToolMetadata.description,
      inputSchema: bridgingInputSchema.shape,
      annotations: bridgingToolMetadata.annotations,
    },
    async (input) => {
      const response = runBridgingCalculator(input);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  server.registerTool(
    bridgingCostToolMetadata.name,
    {
      title: bridgingCostToolMetadata.title,
      description: bridgingCostToolMetadata.description,
      inputSchema: bridgingCostInputSchema.shape,
      annotations: bridgingCostToolMetadata.annotations,
    },
    async (input) => {
      const response = runBridgingCostAnalyser(input);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  server.registerTool(
    developmentAppraisalToolMetadata.name,
    {
      title: developmentAppraisalToolMetadata.title,
      description: developmentAppraisalToolMetadata.description,
      inputSchema: developmentAppraisalInputSchema.shape,
      annotations: developmentAppraisalToolMetadata.annotations,
    },
    async (input) => {
      const response = runDevelopmentAppraisal(input);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  server.registerTool(
    btlStressToolMetadata.name,
    {
      title: btlStressToolMetadata.title,
      description: btlStressToolMetadata.description,
      inputSchema: btlStressInputSchema.shape,
      annotations: btlStressToolMetadata.annotations,
    },
    async (input) => {
      const response = runBtlStressTester(input);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  return server;
}
