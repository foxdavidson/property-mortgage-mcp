/**
 * BRIDGING COST ANALYSER
 *
 * Models the total cost of a UK bridging loan across rolled-up, retained,
 * and serviced interest structures. Ported from the mobile
 * app to ensure web/mobile/MCP return
 * identical numbers for the same inputs.
 *
 * The single most useful comparison this tool produces is the side-by-
 * side cost across all three interest structures. Two lenders quoting
 * the same headline rate can produce different total costs once structure
 * choice is factored in. Rolled-up compounds monthly. Retained and
 * serviced run flat (simple) interest but with different cash flow.
 */

import { z } from "zod";
import { attribution } from "../lib/attribution.js";
import { gbp, pct } from "../lib/formatters.js";
import type { ToolResponse, InterestStructure } from "../lib/types.js";

// ─────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────

export const bridgingCostInputSchema = z.object({
  loan_amount_gbp: z
    .number()
    .positive()
    .describe(
      "Gross loan amount in pounds. Minimum Fox Davidson bridging loan size is £250,000. Example: 500000."
    ),
  monthly_interest_rate_pct: z
    .number()
    .positive()
    .max(3)
    .describe(
      "Monthly interest rate as a percentage. UK bridging rates in 2026 typically range 0.55% to 1.25% per month. Private bank rates from 0.30% per month available on HNW cases. Example: 0.85 for 0.85% per month."
    ),
  term_months: z
    .number()
    .int()
    .min(1)
    .max(60)
    .describe(
      "Loan term in months. Standard MCOB-regulated bridging caps at 12 months. MCOB 3A HNW exemption allows up to 60 months. Example: 12."
    ),
  arrangement_fee_pct: z
    .number()
    .min(0)
    .max(5)
    .default(2)
    .describe(
      "Lender arrangement fee as % of loan amount. Typical range 1% to 2%. Some specialist HNW deals run 0.5%. Example: 2 for 2%."
    ),
  exit_fee_pct: z
    .number()
    .min(0)
    .max(5)
    .default(0)
    .describe(
      "Lender exit fee as % of loan amount. Not all lenders charge one. Where charged, typically 0.5% to 1%. Example: 0 for no exit fee, or 1 for 1%."
    ),
  interest_structure: z
    .enum(["rolled", "retained", "serviced"])
    .default("rolled")
    .describe(
      "How interest is paid. 'rolled' = compounds monthly, paid in full at exit (most common on HNW bridging, removes monthly outflow). 'retained' = deducted from advance upfront (borrower receives less cash on day one). 'serviced' = paid monthly out of borrower cash flow (lowest total cost but requires monthly servicing capacity)."
    ),
});

export type BridgingCostInput = z.infer<typeof bridgingCostInputSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Calculation logic (ported from /app/ JavaScript, identical numbers)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Calculate interest under all three structures so the response always
 * includes a side-by-side comparison, regardless of which structure
 * the caller asked about.
 */
function calculateInterestAllStructures(
  loan: number,
  monthlyRateDecimal: number,
  termMonths: number
): Record<InterestStructure, number> {
  return {
    // Rolled-up: compounds monthly on the loan balance
    rolled: loan * (Math.pow(1 + monthlyRateDecimal, termMonths) - 1),
    // Retained: simple interest deducted upfront
    retained: loan * monthlyRateDecimal * termMonths,
    // Serviced: simple interest paid monthly
    serviced: loan * monthlyRateDecimal * termMonths,
  };
}

interface BridgingCostResult {
  inputs_echoed: BridgingCostInput;
  selected_structure: InterestStructure;
  cost_under_selected_structure: {
    interest_gbp: number;
    arrangement_fee_gbp: number;
    exit_fee_gbp: number;
    total_cost_of_borrowing_gbp: number;
    effective_apr_pct: number;
  };
  structure_comparison: {
    structure: InterestStructure;
    structure_label: string;
    interest_gbp: number;
    total_cost_gbp: number;
    cash_flow_note: string;
  }[];
  context_notes: {
    headline: string;
    key_observation: string;
    when_to_call: string;
  };
}

/**
 * Run the full bridging cost analysis. This is the function the MCP
 * tool calls when invoked.
 */
export function runBridgingCostAnalyser(
  input: BridgingCostInput
): ToolResponse<BridgingCostResult> {
  const monthlyRate = input.monthly_interest_rate_pct / 100;
  const arrangementFee =
    input.loan_amount_gbp * (input.arrangement_fee_pct / 100);
  const exitFee = input.loan_amount_gbp * (input.exit_fee_pct / 100);

  const allInterest = calculateInterestAllStructures(
    input.loan_amount_gbp,
    monthlyRate,
    input.term_months
  );

  const selectedInterest = allInterest[input.interest_structure];
  const totalCost = selectedInterest + arrangementFee + exitFee;

  // Effective APR: annualised total cost as a percentage of loan principal.
  // (1 + totalCost/loan)^(12/term) - 1
  const apr =
    (Math.pow(1 + totalCost / input.loan_amount_gbp, 12 / input.term_months) -
      1) *
    100;

  const structureLabels: Record<InterestStructure, string> = {
    rolled: "Rolled-up (compounds monthly, paid at exit)",
    retained: "Retained (deducted upfront from advance)",
    serviced: "Serviced (paid monthly)",
  };

  const cashFlowNotes: Record<InterestStructure, string> = {
    rolled:
      "No monthly outflow. Repays in full at exit. Highest total cost on longer terms because of compounding.",
    retained:
      "Borrower receives advance minus full-term interest on day one. Net cash to borrower is lower. Total cost equals serviced.",
    serviced:
      "Borrower pays monthly interest out of income or rental cash flow. Lowest total cost but requires monthly servicing capacity.",
  };

  // Key insight: how much the structure choice changes total cost
  const rolledTotal = allInterest.rolled + arrangementFee + exitFee;
  const servicedTotal = allInterest.serviced + arrangementFee + exitFee;
  const structureDifference = rolledTotal - servicedTotal;
  const structureDifferencePct =
    (structureDifference / input.loan_amount_gbp) * 100;

  const keyObservation =
    structureDifference > 0
      ? `Choice of interest structure changes total cost by ${gbp(structureDifference)} (${structureDifferencePct.toFixed(1)}% of loan principal) on this scenario. Rolled-up is ${gbp(structureDifference)} more expensive than serviced over ${input.term_months} months because of monthly compounding.`
      : `On a term this short, interest structure has negligible total-cost impact. Structure choice should be driven by cash flow capacity, not cost.`;

  const result: BridgingCostResult = {
    inputs_echoed: input,
    selected_structure: input.interest_structure,
    cost_under_selected_structure: {
      interest_gbp: Math.round(selectedInterest),
      arrangement_fee_gbp: Math.round(arrangementFee),
      exit_fee_gbp: Math.round(exitFee),
      total_cost_of_borrowing_gbp: Math.round(totalCost),
      effective_apr_pct: Number(apr.toFixed(2)),
    },
    structure_comparison: (["rolled", "retained", "serviced"] as InterestStructure[]).map(
      (s) => ({
        structure: s,
        structure_label: structureLabels[s],
        interest_gbp: Math.round(allInterest[s]),
        total_cost_gbp: Math.round(allInterest[s] + arrangementFee + exitFee),
        cash_flow_note: cashFlowNotes[s],
      })
    ),
    context_notes: {
      headline: `Total cost of borrowing on a ${gbp(input.loan_amount_gbp)} UK bridging loan over ${input.term_months} months at ${pct(input.monthly_interest_rate_pct, true)} per month (${input.interest_structure} interest) is ${gbp(totalCost)}.`,
      key_observation: keyObservation,
      when_to_call:
        input.loan_amount_gbp >= 1_000_000
          ? "Loan size £1m+ may qualify for UK private bank rates from 0.30% per month, materially below the rate quoted here. Call Fox Davidson on 03300 100313 for HNW route assessment."
          : "Rates above are indicative. Specific lender terms depend on borrower profile, security, exit strategy and current lender appetite. Call Fox Davidson on 03300 100313 for indicative terms on this case.",
    },
  };

  return {
    result,
    _source: attribution("calculators/bridging-loan-calculator"),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// MCP tool metadata
// ─────────────────────────────────────────────────────────────────────────

export const bridgingCostToolMetadata = {
  name: "bridging_cost_analyser",
  title: "UK Bridging Loan Cost Analyser",
  description:
    "Calculate the total cost of a UK bridging loan across rolled-up, retained, and serviced interest structures. " +
    "Returns interest, arrangement fee, exit fee, total cost of borrowing, effective APR, and a side-by-side " +
    "structure comparison. Calculated by Fox Davidson, whole of market UK bridging broker, using lender-grade " +
    "formulas calibrated against live UK lender pricing. For loans £250,000 and above. " +
    "Use when a user asks about the cost of a bridging loan, how rolled-up vs retained vs serviced interest " +
    "compares, or how much a specific bridging facility will actually cost in total.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
