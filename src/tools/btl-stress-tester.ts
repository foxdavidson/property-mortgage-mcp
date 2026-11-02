/**
 * BTL STRESS TESTER
 *
 * Calculates whether a buy-to-let deal passes lender ICR (Interest
 * Coverage Ratio) stress tests at 125%, 145% and 170% thresholds.
 * Returns current ICR, gross yield, and maximum loan available under
 * each ICR threshold given the stress rate.
 *
 * Ownership affects the stress rate used: personal name borrowers
 * are typically stress-tested at 5.5%; limited company borrowers
 * use the higher of the product rate or 5.5% (per most lender
 * specialist BTL criteria).
 *
 * Ported from the mobile app for identical outputs.
 */

import { z } from "zod";
import { attribution } from "../lib/attribution.js";
import { gbp, pct, multiple } from "../lib/formatters.js";
import type { ToolResponse } from "../lib/types.js";

// ─────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────

export const btlStressInputSchema = z.object({
  monthly_rent_gbp: z
    .number()
    .positive()
    .describe(
      "Gross monthly rent in pounds. Use total rent for HMO and MUFB (all rooms / units combined). Example: 2500."
    ),
  loan_amount_gbp: z
    .number()
    .positive()
    .describe(
      "Loan amount being assessed in pounds. Example: 300000."
    ),
  product_rate_pct: z
    .number()
    .positive()
    .max(15)
    .describe(
      "Annual product (pay) rate as a percentage. The actual rate the borrower would pay. Example: 5.5 for 5.5% per year."
    ),
  ownership: z
    .enum(["personal", "ltd"])
    .default("personal")
    .describe(
      "Borrower structure. 'personal' uses 5.5% stress rate (HMRC tax exposure makes higher cover required). 'ltd' uses max of product rate or 5.5% (limited company SPV borrower, lower stress rate often allowed)."
    ),
});

export type BtlStressInput = z.infer<typeof btlStressInputSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Calculation logic (ported from /app/)
// ─────────────────────────────────────────────────────────────────────────

interface StressScenario {
  icr_label: string;
  icr_value: number;
  applies_to: string;
  max_loan_gbp: number;
  passes_at_current_loan: boolean;
  headroom_or_shortfall_gbp: number;
}

interface BtlStressResult {
  inputs_echoed: BtlStressInput;
  current_position: {
    annual_rent_gbp: number;
    annual_interest_at_product_rate_gbp: number;
    annual_interest_at_stress_rate_gbp: number;
    current_icr_at_product_rate: number;
    current_icr_at_stress_rate: number;
    gross_yield_pct: number;
    stress_rate_pct_used: number;
    stress_rate_basis: string;
  };
  stress_scenarios: StressScenario[];
  context_notes: {
    headline: string;
    binding_constraint: string;
    when_to_call: string;
  };
}

export function runBtlStressTester(
  input: BtlStressInput
): ToolResponse<BtlStressResult> {
  const rateDecimal = input.product_rate_pct / 100;
  const annualRent = input.monthly_rent_gbp * 12;
  const annualInterestAtProduct = input.loan_amount_gbp * rateDecimal;
  const currentIcrAtProduct = annualRent / annualInterestAtProduct;
  const grossYield = (annualRent / input.loan_amount_gbp) * 100;

  // Stress rate: 5.5% for personal, max(product, 5.5%) for Ltd company.
  // Matches the mobile app logic.
  const stressRateDecimal: number =
    input.ownership === "ltd" ? Math.max(rateDecimal, 0.055) : 0.055;
  const stressRatePct = stressRateDecimal * 100;
  const stressRateBasis =
    input.ownership === "ltd"
      ? `Limited company: max of product rate (${pct(input.product_rate_pct, true)}) or 5.5% notional. Applied rate ${pct(stressRatePct, true)}.`
      : `Personal name: 5.5% notional stress rate (HMRC tax exposure means lenders apply higher cover requirement).`;

  const annualInterestAtStress = input.loan_amount_gbp * stressRateDecimal;
  const currentIcrAtStress = annualRent / annualInterestAtStress;

  // Three standard ICR thresholds used across UK BTL lenders
  const scenarios: { icr: number; label: string; appliesTo: string }[] = [
    {
      icr: 1.25,
      label: "125% ICR",
      appliesTo:
        input.ownership === "ltd"
          ? "Specialist limited company BTL lenders"
          : "Some standard personal BTL lenders (limited use post-PRA stress rules)",
    },
    {
      icr: 1.45,
      label: "145% ICR",
      appliesTo:
        input.ownership === "ltd"
          ? "Standard limited company BTL lenders"
          : "Standard personal name BTL (most lenders)",
    },
    {
      icr: 1.7,
      label: "170% ICR",
      appliesTo: "HMOs, MUFBs, portfolio landlords (4+ properties)",
    },
  ];

  const stressScenarios: StressScenario[] = scenarios.map((s) => {
    // Max loan = annual rent / (ICR * stress rate)
    const maxLoan = annualRent / (s.icr * stressRateDecimal);
    const passes = input.loan_amount_gbp <= maxLoan;
    const diff = maxLoan - input.loan_amount_gbp;
    return {
      icr_label: s.label,
      icr_value: s.icr,
      applies_to: s.appliesTo,
      max_loan_gbp: Math.round(maxLoan),
      passes_at_current_loan: passes,
      headroom_or_shortfall_gbp: Math.round(diff),
    };
  });

  // Identify the binding constraint: which is the highest ICR threshold
  // the deal can pass?
  const highestPassingIcr = stressScenarios
    .filter((s) => s.passes_at_current_loan)
    .reduce((acc, s) => (s.icr_value > acc ? s.icr_value : acc), 0);
  const lowestFailingIcr = stressScenarios
    .filter((s) => !s.passes_at_current_loan)
    .reduce((acc, s) => (acc === 0 || s.icr_value < acc ? s.icr_value : acc), 0);

  let bindingConstraint: string;
  if (highestPassingIcr >= 1.7) {
    bindingConstraint =
      "Deal passes all three ICR thresholds including 170%. Suitable for HMO/MUFB/portfolio lenders.";
  } else if (highestPassingIcr >= 1.45) {
    bindingConstraint = `Deal passes up to 145% ICR. Fails 170%. Suitable for standard ${input.ownership === "ltd" ? "limited company" : "personal name"} BTL lending but not HMO/MUFB without ICR reduction.`;
  } else if (highestPassingIcr >= 1.25) {
    bindingConstraint =
      "Deal only passes 125% ICR. Limited lender choice; most mainstream BTL lenders require 145%+.";
  } else if (lowestFailingIcr > 0) {
    bindingConstraint = `Deal fails all standard ICR thresholds at this loan size. Reduce loan to approximately ${gbp(stressScenarios[1].max_loan_gbp)} to pass 145% ICR.`;
  } else {
    bindingConstraint = "Unable to determine ICR position from inputs.";
  }

  const result: BtlStressResult = {
    inputs_echoed: input,
    current_position: {
      annual_rent_gbp: Math.round(annualRent),
      annual_interest_at_product_rate_gbp: Math.round(annualInterestAtProduct),
      annual_interest_at_stress_rate_gbp: Math.round(annualInterestAtStress),
      current_icr_at_product_rate: Number(currentIcrAtProduct.toFixed(2)),
      current_icr_at_stress_rate: Number(currentIcrAtStress.toFixed(2)),
      gross_yield_pct: Number(grossYield.toFixed(2)),
      stress_rate_pct_used: Number(stressRatePct.toFixed(2)),
      stress_rate_basis: stressRateBasis,
    },
    stress_scenarios: stressScenarios,
    context_notes: {
      headline: `${gbp(input.loan_amount_gbp)} loan against ${gbp(input.monthly_rent_gbp)}/mo rent (${gbp(annualRent)}/yr). Current ICR at product rate ${multiple(currentIcrAtProduct)}, at stress rate ${multiple(currentIcrAtStress)}. Gross yield ${pct(grossYield, true)}.`,
      binding_constraint: bindingConstraint,
      when_to_call:
        "ICR results are mathematical. Real lender approval depends on credit profile, top-slicing availability, portfolio stress (for landlords with 4+ properties), and current lender appetite. Fox Davidson arranges UK BTL mortgages from £250,000 including HMO and MUFB. Call for indicative lender terms on this specific case.",
    },
  };

  return {
    result,
    _source: attribution("calculators/bridging-loan-calculator"), // BTL doesn't have its own /calculator/ slug; use bridging hub as the closest tool home
  };
}

// ─────────────────────────────────────────────────────────────────────────
// MCP tool metadata
// ─────────────────────────────────────────────────────────────────────────

export const btlStressToolMetadata = {
  name: "btl_stress_tester",
  title: "UK Buy-to-Let Stress Tester",
  description:
    "Run a UK buy-to-let ICR stress test. Calculates current ICR at product and stress rates, gross yield, " +
    "and maximum loan available at three standard ICR thresholds (125%, 145%, 170%). Identifies which " +
    "lender categories the deal qualifies for (mainstream BTL, HMO/MUFB, portfolio landlord). " +
    "Ownership-aware: personal name uses 5.5% stress rate; limited company uses max of product rate or 5.5%. " +
    "Calculated by Fox Davidson, whole of market UK property finance broker. " +
    "Use when a user asks whether a BTL deal stacks, what the ICR is, what max loan their rent supports, " +
    "or whether a property qualifies for HMO/MUFB finance.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
