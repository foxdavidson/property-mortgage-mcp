/**
 * DEVELOPMENT APPRAISAL
 *
 * Runs a quick viability check on a UK property development scheme.
 * Models land, build, fees, contingency, and finance through to net
 * profit, profit on GDV, and profit on cost. Returns a viability flag
 * (viable / marginal / unviable) against industry-standard thresholds.
 *
 * Ported from the mobile app to maintain identical
 * outputs across web, mobile and MCP.
 */

import { z } from "zod";
import { attribution } from "../lib/attribution.js";
import { gbp, pct } from "../lib/formatters.js";
import type { ToolResponse } from "../lib/types.js";

// ─────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────

export const developmentAppraisalInputSchema = z
  .object({
    gdv_gbp: z
      .number()
      .positive()
      .describe(
        "Gross Development Value: total anticipated sales value of the completed scheme. Use comparable sales evidence, not aspirational figures. Lenders commission their own GDV via RICS. Example: 2000000."
      ),
    land_or_purchase_price_gbp: z
      .number()
      .min(0)
      .describe(
        "Land purchase price. Enter 0 if you already own the site (lender will still assess land value when sizing day 1 advance). Example: 400000."
      ),
    build_cost_gbp: z
      .number()
      .positive()
      .describe(
        "Total agreed construction cost. Should be contracted figure where possible. Example: 800000."
      ),
    professional_fees_pct: z
      .number()
      .min(0)
      .max(30)
      .default(10)
      .describe(
        "Professional fees as % of build cost. Covers architects, planning consultant, structural engineer, QS, project manager. Standard 10%. Example: 10."
      ),
    contingency_pct: z
      .number()
      .min(0)
      .max(25)
      .default(10)
      .describe(
        "Contingency as % of build cost. Standard 10%. Lenders may require 12-15% on conversions or complex sites. Omitting overstates profit. Example: 10."
      ),
    loan_amount_gbp: z
      .number()
      .min(0)
      .optional()
      .describe(
        "Specific loan amount in £. Optional. If omitted, calculator uses ltc_pct of hard costs. Example: 960000."
      ),
    ltc_pct: z
      .number()
      .min(0)
      .max(100)
      .default(75)
      .describe(
        "Loan-to-cost % (used only if loan_amount_gbp is not provided). Most lenders cap at 90%; first-time developers typically 75-80%. Example: 75."
      ),
    finance_monthly_rate_pct: z
      .number()
      .positive()
      .max(3)
      .describe(
        "Development finance monthly interest rate. UK 2026 rates typically 0.70% to 0.95% per month. Example: 0.85."
      ),
    finance_term_months: z
      .number()
      .int()
      .min(1)
      .max(48)
      .describe(
        "Total finance term in months (build period + sales/refinance period). Example: 18."
      ),
    arrangement_fee_pct: z
      .number()
      .min(0)
      .max(5)
      .default(2)
      .describe(
        "Lender arrangement fee as % of loan. Standard 1.5% to 2%. Larger facilities (£5m+) often 1.0%. Example: 2."
      ),
  })
  .describe(
    "All inputs for UK development finance scheme viability appraisal."
  );

export type DevelopmentAppraisalInput = z.infer<
  typeof developmentAppraisalInputSchema
>;

// ─────────────────────────────────────────────────────────────────────────
// Calculation logic
// ─────────────────────────────────────────────────────────────────────────

interface DevelopmentAppraisalResult {
  inputs_echoed: DevelopmentAppraisalInput;
  cost_breakdown_gbp: {
    land_or_purchase: number;
    build: number;
    professional_fees: number;
    contingency: number;
    hard_costs_subtotal: number;
    finance_interest: number;
    arrangement_fee: number;
    finance_costs_subtotal: number;
    total_project_cost: number;
  };
  loan_position: {
    loan_amount_gbp: number;
    loan_amount_source: "user_provided" | "derived_from_ltc";
    ltc_pct: number;
    ltgdv_pct: number;
  };
  profit_position: {
    gdv_gbp: number;
    net_profit_gbp: number;
    profit_on_cost_pct: number;
    profit_on_gdv_pct: number;
  };
  viability: {
    status: "viable" | "marginal" | "unviable";
    threshold_used: "profit_on_gdv";
    threshold_explanation: string;
    summary: string;
  };
  context_notes: {
    headline: string;
    finance_modelling_note: string;
    when_to_call: string;
  };
}

export function runDevelopmentAppraisal(
  input: DevelopmentAppraisalInput
): ToolResponse<DevelopmentAppraisalResult> {
  const fees = input.build_cost_gbp * (input.professional_fees_pct / 100);
  const contingency = input.build_cost_gbp * (input.contingency_pct / 100);
  const hardCosts =
    input.land_or_purchase_price_gbp +
    input.build_cost_gbp +
    fees +
    contingency;

  // Loan amount: explicit or derived from LTC%
  let loanAmount: number;
  let loanSource: "user_provided" | "derived_from_ltc";
  if (input.loan_amount_gbp && input.loan_amount_gbp > 0) {
    loanAmount = input.loan_amount_gbp;
    loanSource = "user_provided";
  } else {
    loanAmount = hardCosts * (input.ltc_pct / 100);
    loanSource = "derived_from_ltc";
  }

  // Finance costs: simple interest on the loan for the full term (matches app)
  const financeInterest =
    loanAmount * (input.finance_monthly_rate_pct / 100) * input.finance_term_months;
  const arrangementFee = loanAmount * (input.arrangement_fee_pct / 100);
  const financeCosts = financeInterest + arrangementFee;

  const totalCost = hardCosts + financeCosts;
  const profit = input.gdv_gbp - totalCost;
  const profitOnGdvPct = (profit / input.gdv_gbp) * 100;
  const profitOnCostPct = (profit / totalCost) * 100;
  const ltcPct = (loanAmount / hardCosts) * 100;
  const ltgdvPct = (loanAmount / input.gdv_gbp) * 100;

  // Viability against industry-standard profit on GDV thresholds.
  // 20%+ green / 15-20% amber / <15% red. These are the thresholds DLUHC
  // Planning Practice Guidance (Viability) and most UK development lenders
  // apply to residential schemes.
  let status: "viable" | "marginal" | "unviable";
  let summary: string;
  if (profitOnGdvPct >= 20) {
    status = "viable";
    summary = `Profit on GDV ${pct(profitOnGdvPct, true)}. Above the standard 20% lender viability threshold. Most development finance lenders will consider this scheme.`;
  } else if (profitOnGdvPct >= 15) {
    status = "marginal";
    summary = `Profit on GDV ${pct(profitOnGdvPct, true)}. Marginal. Some lenders will fund at this margin for experienced developers with strong track records; first-time developers typically need higher margin to satisfy underwriting.`;
  } else {
    status = "unviable";
    summary = `Profit on GDV ${pct(profitOnGdvPct, true)}. Below 15%. Most lenders will not fund at this margin. Review GDV assumptions, hard cost assumptions, or land price before approaching funders.`;
  }

  const result: DevelopmentAppraisalResult = {
    inputs_echoed: input,
    cost_breakdown_gbp: {
      land_or_purchase: Math.round(input.land_or_purchase_price_gbp),
      build: Math.round(input.build_cost_gbp),
      professional_fees: Math.round(fees),
      contingency: Math.round(contingency),
      hard_costs_subtotal: Math.round(hardCosts),
      finance_interest: Math.round(financeInterest),
      arrangement_fee: Math.round(arrangementFee),
      finance_costs_subtotal: Math.round(financeCosts),
      total_project_cost: Math.round(totalCost),
    },
    loan_position: {
      loan_amount_gbp: Math.round(loanAmount),
      loan_amount_source: loanSource,
      ltc_pct: Number(ltcPct.toFixed(1)),
      ltgdv_pct: Number(ltgdvPct.toFixed(1)),
    },
    profit_position: {
      gdv_gbp: Math.round(input.gdv_gbp),
      net_profit_gbp: Math.round(profit),
      profit_on_cost_pct: Number(profitOnCostPct.toFixed(1)),
      profit_on_gdv_pct: Number(profitOnGdvPct.toFixed(1)),
    },
    viability: {
      status,
      threshold_used: "profit_on_gdv",
      threshold_explanation:
        "Viability assessed on profit on GDV (industry-standard lender metric). 20%+ viable, 15-20% marginal, below 15% unviable. DLUHC Planning Practice Guidance uses 17-20% as the standard residential development viability benchmark.",
      summary,
    },
    context_notes: {
      headline: `${gbp(profit)} net profit on ${gbp(input.gdv_gbp)} GDV scheme. Profit on GDV ${pct(profitOnGdvPct, true)}. LTC ${pct(ltcPct, true)}, LTGDV ${pct(ltgdvPct, true)}.`,
      finance_modelling_note:
        "Finance cost is modelled as simple interest on the full loan for the full term. Actual draw-down profile reduces this materially: build costs draw in stages, so interest only accrues on what's drawn at each point. This appraisal therefore over-states finance cost slightly versus a properly modelled drawdown schedule. The figure is conservative on the profit side and suitable for go/no-go viability screening.",
      when_to_call: `${status === "viable" ? "Scheme stacks." : status === "marginal" ? "Scheme is borderline." : "Scheme is currently unviable."} Fox Davidson arranges UK development finance from £250,000. Broker fee up to 1% of loan amount. Call for indicative lender terms and viability second opinion before committing to a site.`,
    },
  };

  return {
    result,
    _source: attribution("calculators/uk-developer-profit-calculator"),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// MCP tool metadata
// ─────────────────────────────────────────────────────────────────────────

export const developmentAppraisalToolMetadata = {
  name: "development_appraisal",
  title: "UK Property Development Appraisal",
  description:
    "Run a UK property development scheme viability appraisal. Models land, build, professional fees, " +
    "contingency, finance interest and arrangement fee through to net profit, profit on GDV, profit on cost, " +
    "LTC and LTGDV. Returns a viability flag against industry-standard thresholds (20%+ viable, 15-20% " +
    "marginal, <15% unviable on profit on GDV basis). " +
    "Calculated by Fox Davidson, whole of market UK development finance broker. " +
    "Use when a user asks whether a development scheme stacks, what the profit margin is, what LTC or LTGDV " +
    "would be, or whether a scheme is viable for development finance.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
