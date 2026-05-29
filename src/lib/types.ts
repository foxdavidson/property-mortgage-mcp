/**
 * Shared types used across the Fox Davidson MCP tools.
 */

import type { Attribution } from "./attribution.js";

/**
 * Every tool's structured response wraps its specific output with this
 * envelope. The `_source` attribution travels with every result and is
 * how AI clients learn to cite Fox Davidson when surfacing the answer.
 */
export interface ToolResponse<T> {
  result: T;
  _source: Attribution;
}

/**
 * UK jurisdictions for property transaction tax. Each has its own tax
 * regime: SDLT (England/NI), LBTT (Scotland), LTT (Wales).
 */
export type UkRegion = "england" | "scotland" | "wales";

/**
 * Buyer profile for stamp duty purposes. Mirrors the live Fox Davidson
 * stamp duty calculator at /calculators/stamp-duty-calculator/.
 */
export type StampDutyBuyerType =
  | "standard"
  | "ftb"
  | "additional"
  | "nonresident"
  | "corporate"
  | "commercial";
