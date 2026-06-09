/**
 * UK BRIDGING LOAN CALCULATOR (with MCOB 3A term check) — Fox Davidson
 *
 * Mirrors the live Fox Davidson bridging loan calculator at
 * /calculators/bridging-loan-calculator/. Returns the full cost of a UK
 * bridging loan across rolled-up, retained and serviced interest, plus a
 * built-in FCA MCOB 3A high net worth check that determines whether a
 * regulated bridge can run up to 60 months instead of the standard 12-month
 * cap.
 *
 * Ported verbatim from the Fox Davidson WebMCP browser tool
 * (web/fd-webmcp.js) so web, WebMCP and Anthropic MCP outputs are identical.
 */

import { z } from "zod";
import { attribution } from "../lib/attribution.js";
import type { ToolResponse } from "../lib/types.js";

const INCOME_THRESHOLD = 300000;
const ASSETS_THRESHOLD = 3000000;

// ─────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────

export const bridgingInputSchema = z.object({
  property_value_gbp: z
    .number()
    .min(1)
    .describe("Open market value of the security property in pounds."),
  existing_charges_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Existing mortgages or loans the bridge will repay, in pounds."),
  additional_funds_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Additional cash required beyond clearing existing charges, in pounds."),
  monthly_rate_pct: z
    .number()
    .min(0.2)
    .max(3)
    .default(0.75)
    .describe("Monthly interest rate as a percentage, for example 0.75 for 0.75% per month."),
  interest_structure: z
    .enum(["rolled", "retained", "serviced"])
    .default("rolled")
    .describe(
      "'rolled' compounds monthly and is paid at exit. 'retained' deducts the full term of " +
        "interest from the advance upfront. 'serviced' is paid monthly. Retained and serviced " +
        "cost the same; rolled-up costs more."
    ),
  term_months: z
    .number()
    .min(1)
    .max(60)
    .default(12)
    .describe("Loan term in months."),
  arrangement_fee_pct: z
    .number()
    .min(0)
    .max(5)
    .default(2)
    .describe("Lender arrangement fee as a percentage of the loan."),
  add_arrangement_fee_to_loan: z
    .boolean()
    .default(true)
    .describe(
      "Whether the arrangement fee is financed into the gross loan (true) or paid separately in cash (false)."
    ),
  exit_fee_pct: z
    .number()
    .min(0)
    .max(5)
    .default(0)
    .describe("Exit fee as a percentage, charged on redemption. Often 0."),
  exit_fee_on_gross: z
    .boolean()
    .default(true)
    .describe("Whether the exit fee is charged on the gross loan (true) or the net loan (false)."),
  valuation_fee_gbp: z.number().min(0).default(0).describe("Valuation fee in pounds."),
  legal_fees_gbp: z.number().min(0).default(0).describe("Lender and borrower legal fees in pounds."),
  admin_fees_gbp: z.number().min(0).default(0).describe("Admin and other fees in pounds."),
  regulated: z
    .boolean()
    .default(true)
    .describe(
      "True if the bridge is secured against a property the borrower lives in or intends to live " +
        "in (regulated). False for investment or commercial security (unregulated)."
    ),
  annual_net_income_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe(
      "Optional. Borrower annual net income, used for the MCOB 3A high net worth term check. " +
        "GBP 300,000 or more passes the income limb."
    ),
  net_assets_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe(
      "Optional. Borrower net assets including main residence equity and pension, minus all debts, " +
        "used for the MCOB 3A high net worth term check. GBP 3,000,000 or more passes the net assets limb."
    ),
});

export type BridgingInput = z.infer<typeof bridgingInputSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Calculation logic
// ─────────────────────────────────────────────────────────────────────────

function maxRegulatedTerm(regulated: boolean, hnwQualifies: boolean): number {
  if (!regulated) return 36; // unregulated has no MCOB term cap; 36 is a typical practical ceiling
  return hnwQualifies ? 60 : 12;
}

interface ScheduleRow {
  month: number;
  interest_gbp: number;
  balance_gbp: number;
  redemption_gbp: number;
}

interface BridgingResult {
  inputs_echoed: BridgingInput;
  gross_facility_gbp: number;
  net_loan_gbp: number;
  arrangement_fee_gbp: number;
  loan_to_value_pct: number;
  ltv_flag: "within_typical_range" | "high_may_need_specialist" | "very_high_specialist_only";
  interest_structure: "rolled" | "retained" | "serviced";
  total_interest_gbp: number;
  retained_interest_deducted_upfront_gbp: number;
  total_fees_gbp: number;
  repay_at_exit_gbp: number;
  total_cost_of_finance_gbp: number;
  funds_released_beyond_existing_gbp: number;
  indicative_annualised_cost_pct: number;
  term_months: number;
  mcob_3a_eligibility: {
    regulated: boolean;
    income_limb_pass: boolean;
    net_assets_limb_pass: boolean;
    high_net_worth_qualifies: boolean;
    max_regulated_term_months: number;
    term_within_limit: boolean;
    status: string;
  };
  month_by_month: ScheduleRow[];
  context_notes: {
    method_note: string;
    mcob_note: string;
    when_to_call: string;
  };
}

export function runBridgingCalculator(input: BridgingInput): ToolResponse<BridgingResult> {
  const pv = input.property_value_gbp;
  const existing = input.existing_charges_gbp || 0;
  const additional = input.additional_funds_gbp || 0;
  const net = existing + additional;
  const rate = typeof input.monthly_rate_pct === "number" ? input.monthly_rate_pct : 0.75;
  const type = input.interest_structure || "rolled";
  const months = input.term_months || 12;
  const arrPct = typeof input.arrangement_fee_pct === "number" ? input.arrangement_fee_pct : 2;
  const addFee = input.add_arrangement_fee_to_loan !== false;
  const exitPct = input.exit_fee_pct || 0;
  const exitGross = input.exit_fee_on_gross !== false;
  const val = input.valuation_fee_gbp || 0;
  const legal = input.legal_fees_gbp || 0;
  const admin = input.admin_fees_gbp || 0;
  const regulated = input.regulated !== false;
  const income = input.annual_net_income_gbp || 0;
  const assets = input.net_assets_gbp || 0;

  // MCOB 3A high net worth term eligibility
  const incomePass = income >= INCOME_THRESHOLD;
  const assetsPass = assets >= ASSETS_THRESHOLD;
  const hnwQualifies = incomePass || assetsPass;
  const maxTerm = maxRegulatedTerm(regulated, hnwQualifies);

  const arrFee = Math.round((net * arrPct) / 100);
  const gross = addFee ? net + arrFee : net;
  const ltv = pv > 0 ? (gross / pv) * 100 : 0;
  const exitBase = exitGross ? gross : net;
  const exitAmt = Math.round((exitBase * exitPct) / 100);

  let totalInterest = 0;
  let finalBalance = gross;
  let retained = 0;
  const schedule: ScheduleRow[] = [];

  if (type === "rolled") {
    let bal = gross;
    for (let m = 1; m <= months; m++) {
      const mi = bal * (rate / 100);
      totalInterest += mi;
      bal += mi;
      schedule.push({
        month: m,
        interest_gbp: Math.round(mi),
        balance_gbp: Math.round(bal),
        redemption_gbp: Math.round(bal + exitAmt),
      });
    }
    finalBalance = bal;
  } else {
    const mInt = gross * (rate / 100);
    totalInterest = mInt * months;
    finalBalance = gross;
    if (type === "retained") retained = Math.round(totalInterest);
    for (let k = 1; k <= months; k++) {
      schedule.push({
        month: k,
        interest_gbp: Math.round(mInt),
        balance_gbp: Math.round(gross),
        redemption_gbp: Math.round(gross + exitAmt),
      });
    }
  }
  totalInterest = Math.round(totalInterest);

  const feesTotal = arrFee + exitAmt + val + legal + admin;
  const repayAtExit = Math.round((type === "rolled" ? finalBalance : gross) + exitAmt);
  const totalCost = totalInterest + feesTotal;
  const releaseBeyondExisting = Math.max(0, additional - (type === "retained" ? retained : 0));
  const years = months / 12;
  const annualised = net > 0 && years > 0 ? (totalCost / net / years) * 100 : 0;

  const ltvFlag =
    ltv > 80 ? "very_high_specialist_only" : ltv > 75 ? "high_may_need_specialist" : "within_typical_range";

  let termStatus: string;
  if (!regulated) {
    termStatus = "Unregulated bridge: no MCOB term cap applies.";
  } else if (hnwQualifies) {
    termStatus = "Regulated, high net worth (MCOB 3A): extended term up to 60 months available.";
  } else {
    termStatus =
      "Regulated, standard: 12-month MCOB cap applies. Provide income or net assets to test for " +
      "the 60-month MCOB 3A extension.";
  }

  const result: BridgingResult = {
    inputs_echoed: input,
    gross_facility_gbp: Math.round(gross),
    net_loan_gbp: Math.round(net),
    arrangement_fee_gbp: arrFee,
    loan_to_value_pct: Number(ltv.toFixed(1)),
    ltv_flag: ltvFlag,
    interest_structure: type,
    total_interest_gbp: totalInterest,
    retained_interest_deducted_upfront_gbp: retained,
    total_fees_gbp: Math.round(feesTotal),
    repay_at_exit_gbp: repayAtExit,
    total_cost_of_finance_gbp: Math.round(totalCost),
    funds_released_beyond_existing_gbp: Math.round(releaseBeyondExisting),
    indicative_annualised_cost_pct: Number(annualised.toFixed(1)),
    term_months: months,
    mcob_3a_eligibility: {
      regulated,
      income_limb_pass: incomePass,
      net_assets_limb_pass: assetsPass,
      high_net_worth_qualifies: hnwQualifies,
      max_regulated_term_months: maxTerm,
      term_within_limit: months <= maxTerm,
      status: termStatus,
    },
    month_by_month: schedule,
    context_notes: {
      method_note:
        "Rolled-up interest compounds monthly on the gross facility. Retained and serviced " +
        "interest are simple interest on the gross facility across the term, and cost the same in " +
        "total; rolled-up costs more. Total cost of finance is interest plus all fees, excluding " +
        "repayment of the principal borrowed.",
      mcob_note:
        "A standard regulated bridge is capped at 12 months under FCA MCOB 11. The MCOB 3A high " +
        "net worth exemption (annual net income of at least GBP 300,000 OR net assets of at least " +
        "GBP 3,000,000, with main residence equity and pension included in the net assets figure) " +
        "lifts the cap to 60 months on a regulated bridge.",
      when_to_call:
        "A bridging loan rewards lender selection. Rates, fees, LTV limits and underwriting " +
        "appetite vary widely, and the wrong choice on a time-critical deal can cost the purchase. " +
        "Fox Davidson arranges regulated and unregulated bridging from GBP 250,000.",
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

export const bridgingToolMetadata = {
  name: "uk_bridging_loan_calculator",
  title: "UK Bridging Loan Calculator (with MCOB 3A term check)",
  description:
    "Calculate the full cost of a UK bridging loan: total interest, arrangement and exit fees, " +
    "valuation/legal/admin costs, gross facility, net advance, loan-to-value, total cost of finance " +
    "and an indicative annualised cost. Supports rolled-up (compounding), retained (deducted " +
    "upfront) and serviced (paid monthly) interest. Also runs the FCA MCOB 3A high net worth check: " +
    "on a regulated bridge, an applicant with annual net income of at least GBP 300,000 OR net " +
    "assets of at least GBP 3,000,000 can have a term up to 60 months instead of the standard " +
    "12-month cap. Calculated by Fox Davidson, FCA-authorised UK mortgage brokers (FRN 600427). " +
    "Use when a user asks what a bridging loan costs, about bridging interest (rolled-up, retained " +
    "or serviced), bridging LTV, regulated vs unregulated bridging, or the maximum term on a " +
    "regulated bridge.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
