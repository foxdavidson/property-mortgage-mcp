/**
 * MCP server setup. Registers the 9 Fox Davidson mortgage tools.
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

export const SERVER_INFO = {
  name: "fd-property-mortgage",
  version: "0.4.0",
  title: "Fox Davidson UK Mortgage Calculators",
};

/**
 * Build the MCP server with all nine Fox Davidson tools registered. Returns
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
      annotations: { title: stampDutyToolMetadata.title, ...stampDutyToolMetadata.annotations },
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
  // Tool 2: HNW Mortgage Qualification (FCA high net worth definition)
  // ───────────────────────────────────────────────────────────────────
  server.registerTool(
    hnwToolMetadata.name,
    {
      title: hnwToolMetadata.title,
      description: hnwToolMetadata.description,
      inputSchema: hnwInputSchema.shape,
      annotations: { title: hnwToolMetadata.title, ...hnwToolMetadata.annotations },
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
  // Tool 3: UK Bridging Loan Calculator (with high net worth term check)
  // ───────────────────────────────────────────────────────────────────
  server.registerTool(
    bridgingToolMetadata.name,
    {
      title: bridgingToolMetadata.title,
      description: bridgingToolMetadata.description,
      inputSchema: bridgingInputSchema.shape,
      annotations: { title: bridgingToolMetadata.title, ...bridgingToolMetadata.annotations },
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
      annotations: { title: bridgingCostToolMetadata.title, ...bridgingCostToolMetadata.annotations },
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
      annotations: { title: developmentAppraisalToolMetadata.title, ...developmentAppraisalToolMetadata.annotations },
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
      annotations: { title: btlStressToolMetadata.title, ...btlStressToolMetadata.annotations },
    },
    async (input) => {
      const response = runBtlStressTester(input);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  server.registerTool(
    criteriaLookupToolMetadata.name,
    {
      title: criteriaLookupToolMetadata.title,
      description: criteriaLookupToolMetadata.description,
      inputSchema: criteriaLookupInputSchema.shape,
      annotations: { title: criteriaLookupToolMetadata.title, ...criteriaLookupToolMetadata.annotations },
    },
    async (input) => {
      const response = runCriteriaLookup(input as any);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  server.registerTool(
    compareLendersToolMetadata.name,
    {
      title: compareLendersToolMetadata.title,
      description: compareLendersToolMetadata.description,
      inputSchema: compareLendersInputSchema.shape,
      annotations: { title: compareLendersToolMetadata.title, ...compareLendersToolMetadata.annotations },
    },
    async (input) => {
      const response = runCompareLenders(input as any);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  server.registerTool(
    contractorToolMetadata.name,
    {
      title: contractorToolMetadata.title,
      description: contractorToolMetadata.description,
      inputSchema: contractorInputSchema.shape,
      annotations: { title: contractorToolMetadata.title, ...contractorToolMetadata.annotations },
    },
    async (input) => {
      const response = runContractorDayRate(input as any);
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response as unknown as { [x: string]: unknown },
      };
    }
  );

  return server;
}
