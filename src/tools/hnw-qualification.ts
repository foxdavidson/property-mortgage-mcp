/**
 * HNW MORTGAGE QUALIFICATION (FCA MCOB 3A test) — Fox Davidson
 *
 * Mirrors the live Fox Davidson HNW Mortgage Qualification Calculator at
 * /calculators/hnw-mortgage-qualification-calculator/. Applies the FCA
 * MCOB 1.2.10R / Handbook Glossary G2953 high net worth mortgage customer
 * test as UK lenders apply it in practice: GBP 300k annual net income OR
 * GBP 3m net assets, with primary residence equity included and pension
 * included by default. Supports single or joint applications.
 *
 * Ported verbatim from the Fox Davidson WebMCP browser tool
 * (web/fd-webmcp.js) so web, WebMCP and Anthropic MCP outputs are identical.
 */

import { z } from "zod";
import { attribution } from "../lib/attribution.js";
import type { ToolResponse } from "../lib/types.js";

const INCOME_THRESHOLD = 300000;
const ASSETS_THRESHOLD = 3000000;
const PRIVATE_BANK_LIST =
  "Coutts, Weatherbys, Investec, JP Morgan Private Bank, UBS Wealth, and Barclays Private Bank";

// ─────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────

const applicantSchema = z.object({
  annual_net_income_gbp: z
    .number()
    .min(0)
    .describe(
      "Annual net income in pounds. Includes salary, bonus, RSU vesting (taxed value), " +
        "dividends, partnership profits, business profits, rental income, carried interest. Net of tax."
    ),
  primary_residence_value_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Gross value of primary residence in pounds."),
  primary_residence_mortgage_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Outstanding mortgage on primary residence in pounds."),
  investment_properties_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Gross value of investment properties (BTL, holiday let, etc.) in pounds."),
  investment_property_mortgages_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Outstanding mortgages on investment properties in pounds."),
  cash_savings_gbp: z.number().min(0).default(0).describe("Cash and savings in pounds."),
  investment_portfolio_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Stocks, bonds, funds. Excludes pension."),
  business_equity_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Your share of business equity value in pounds."),
  business_loans_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Outstanding business loans in pounds."),
  other_assets_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Other valuable assets (art, classic cars, jewellery, hedge fund holdings) in pounds."),
  pension_value_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe("Pension value (SIPP, SSAS, drawdown, workplace) in pounds."),
  material_unsecured_debts_gbp: z
    .number()
    .min(0)
    .default(0)
    .describe(
      "Material unsecured debts in pounds. Small consumer debt and normal overdraft buffer " +
        "do not move the GBP 3m test in practice and can be left at 0."
    ),
  include_pension_in_test: z
    .boolean()
    .default(true)
    .describe(
      "Whether to include pension in the GBP 3m net assets calculation. UK lenders applying " +
        "MCOB 3A typically include pension. Set to false for the conservative view."
    ),
});

export const hnwInputSchema = z.object({
  applicant_1: applicantSchema.describe("The primary applicant."),
  applicant_2: applicantSchema
    .optional()
    .describe(
      "Optional. If provided, the tool runs the joint application test which returns each " +
        "applicant individually plus a joint household aggregate. Most lenders apply the MCOB " +
        "3A test per individual customer."
    ),
});

export type HnwInput = z.infer<typeof hnwInputSchema>;
type Applicant = z.infer<typeof applicantSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Calculation logic
// ─────────────────────────────────────────────────────────────────────────

interface Normalised {
  income: number;
  primaryResidence: number;
  primaryMortgage: number;
  investmentProperties: number;
  investmentMortgages: number;
  cash: number;
  portfolio: number;
  business: number;
  businessLoans: number;
  otherAssets: number;
  pension: number;
  includePension: boolean;
  otherDebts: number;
}

function normalise(a: Partial<Applicant> | undefined): Normalised {
  a = a || {};
  return {
    income: a.annual_net_income_gbp || 0,
    primaryResidence: a.primary_residence_value_gbp || 0,
    primaryMortgage: a.primary_residence_mortgage_gbp || 0,
    investmentProperties: a.investment_properties_gbp || 0,
    investmentMortgages: a.investment_property_mortgages_gbp || 0,
    cash: a.cash_savings_gbp || 0,
    portfolio: a.investment_portfolio_gbp || 0,
    business: a.business_equity_gbp || 0,
    businessLoans: a.business_loans_gbp || 0,
    otherAssets: a.other_assets_gbp || 0,
    pension: a.pension_value_gbp || 0,
    includePension: a.include_pension_in_test !== false,
    otherDebts: a.material_unsecured_debts_gbp || 0,
  };
}

interface HnwTest {
  income_gbp: number;
  income_pass: boolean;
  income_gap_gbp: number;
  total_assets_gbp: number;
  total_liabilities_gbp: number;
  net_assets_gbp: number;
  net_assets_pass: boolean;
  net_assets_gap_gbp: number;
  primary_residence_equity_gbp: number;
  pension_included_in_test: boolean;
  qualifies: boolean;
  primary_led_qualification: boolean;
}

function runHnwTest(d: Normalised): HnwTest {
  const primaryEquity = Math.max(0, d.primaryResidence - d.primaryMortgage);
  const pensionContribution = d.includePension ? d.pension : 0;
  const totalAssets =
    d.primaryResidence +
    d.investmentProperties +
    d.cash +
    d.portfolio +
    d.business +
    d.otherAssets +
    pensionContribution;
  const totalLiabilities =
    d.primaryMortgage + d.investmentMortgages + d.businessLoans + d.otherDebts;
  const netAssets = totalAssets - totalLiabilities;
  const incomePass = d.income >= INCOME_THRESHOLD;
  const netAssetsPass = netAssets >= ASSETS_THRESHOLD;
  const primaryLedQualification =
    netAssetsPass && !incomePass && primaryEquity > 0 && primaryEquity >= 0.5 * netAssets;
  return {
    income_gbp: Math.round(d.income),
    income_pass: incomePass,
    income_gap_gbp: Math.round(Math.max(0, INCOME_THRESHOLD - d.income)),
    total_assets_gbp: Math.round(totalAssets),
    total_liabilities_gbp: Math.round(totalLiabilities),
    net_assets_gbp: Math.round(netAssets),
    net_assets_pass: netAssetsPass,
    net_assets_gap_gbp: Math.round(Math.max(0, ASSETS_THRESHOLD - netAssets)),
    primary_residence_equity_gbp: Math.round(primaryEquity),
    pension_included_in_test: d.includePension,
    qualifies: incomePass || netAssetsPass,
    primary_led_qualification: primaryLedQualification,
  };
}

function routingForApplicant(t: HnwTest): string {
  if (t.primary_led_qualification) {
    return (
      "Qualifies on the net assets test, with primary residence equity making the material " +
      "contribution. Under the literal FCA reading that UK lenders apply, primary residence " +
      "equity counts in the GBP 3m test. This is the route that solves the asset-rich-income-poor " +
      "problem: substantial wealth in property, modest current earned income, qualifying access " +
      "to MCOB 3A residential lending. UK private banks lending against asset position under MCOB " +
      "3A include " +
      PRIVATE_BANK_LIST +
      ". Fox Davidson arranges residential mortgages from GBP 250,000 to over GBP 25m on this route."
    );
  }
  if (t.income_pass && t.net_assets_pass) {
    return (
      "Meets both the income and net assets tests. Access to the full range of MCOB 3A " +
      "residential mortgage routes including UK private bank lending, specialist HNW lenders, and " +
      "individual affordability assessment. UK private banks lending under MCOB 3A include " +
      PRIVATE_BANK_LIST +
      "."
    );
  }
  if (t.income_pass) {
    return (
      "Meets the income test. Access to specialist residential mortgage routes that fall outside " +
      "standard MCOB 11.6 affordability rules. Lenders can offer income multiples in the 6x to 10x " +
      "range on the right profile, against the 4.5x cap that applies to standard MCOB 11 lending. " +
      "UK private banks lending under MCOB 3A include " +
      PRIVATE_BANK_LIST +
      ". Specialist HNW lenders include Saffron Building Society and Hodge Bank."
    );
  }
  if (t.net_assets_pass) {
    return (
      "Meets the net assets test. Asset-led affordability allows lenders to lend against the wider " +
      "wealth position rather than current earned income alone. UK private banks lending against " +
      "asset position under MCOB 3A include " +
      PRIVATE_BANK_LIST +
      "."
    );
  }
  return (
    "Does not currently meet either limb of the MCOB 3A test. Standard MCOB 11.6 affordability " +
    "rules apply. May still access enhanced income multiples through high street and specialist " +
    "lenders (5.5x to 6.5x available to high earners on GBP 60,000 to GBP 150,000 income through " +
    "professional schemes) without needing to meet the full HNW test."
  );
}

interface HnwResult {
  inputs_echoed: HnwInput;
  application_type: "single" | "joint";
  thresholds: {
    income_threshold_gbp: number;
    net_assets_threshold_gbp: number;
    rule_reference: string;
  };
  applicant_1: HnwTest;
  applicant_2?: HnwTest;
  joint_household_aggregate?: HnwTest;
  verdict: string;
  routing_recommendation: string;
  context_notes: {
    rule_summary: string;
    primary_residence_note: string;
    pension_note: string;
    when_to_call: string;
  };
}

export function runHnwQualification(input: HnwInput): ToolResponse<HnwResult> {
  const d1 = normalise(input.applicant_1);
  const t1 = runHnwTest(d1);
  const isJoint = !!input.applicant_2;

  const out: HnwResult = {
    inputs_echoed: input,
    application_type: isJoint ? "joint" : "single",
    thresholds: {
      income_threshold_gbp: INCOME_THRESHOLD,
      net_assets_threshold_gbp: ASSETS_THRESHOLD,
      rule_reference:
        "FCA MCOB 1.2.10R / Handbook Glossary G2953 high net worth mortgage customer",
    },
    applicant_1: t1,
    verdict: "",
    routing_recommendation: "",
    context_notes: {
      rule_summary: "",
      primary_residence_note: "",
      pension_note: "",
      when_to_call: "",
    },
  };

  if (isJoint) {
    const d2 = normalise(input.applicant_2);
    const t2 = runHnwTest(d2);
    const aggregate: Normalised = {
      income: d1.income + d2.income,
      primaryResidence: d1.primaryResidence + d2.primaryResidence,
      primaryMortgage: d1.primaryMortgage + d2.primaryMortgage,
      investmentProperties: d1.investmentProperties + d2.investmentProperties,
      investmentMortgages: d1.investmentMortgages + d2.investmentMortgages,
      cash: d1.cash + d2.cash,
      portfolio: d1.portfolio + d2.portfolio,
      business: d1.business + d2.business,
      businessLoans: d1.businessLoans + d2.businessLoans,
      otherAssets: d1.otherAssets + d2.otherAssets,
      pension: d1.pension + d2.pension,
      includePension: d1.includePension && d2.includePension,
      otherDebts: d1.otherDebts + d2.otherDebts,
    };
    const tA = runHnwTest(aggregate);

    out.applicant_2 = t2;
    out.joint_household_aggregate = tA;

    const bothQualify = t1.qualifies && t2.qualifies;
    const anyIndividualQualifies = t1.qualifies || t2.qualifies;
    const aggregateOnly = !anyIndividualQualifies && tA.qualifies;

    if (bothQualify) {
      out.verdict = "Both applicants qualify under MCOB 3A";
      out.routing_recommendation = routingForApplicant(tA);
    } else if (anyIndividualQualifies) {
      out.verdict = "Applicant " + (t1.qualifies ? "1" : "2") + " qualifies under MCOB 3A";
      out.routing_recommendation =
        routingForApplicant(t1.qualifies ? t1 : t2) +
        " Most lenders will write the case on the qualifying applicant's MCOB 3A status, with the " +
        "second applicant treated under standard MCOB 11. Some lenders apply a stricter joint-test " +
        "requirement.";
    } else if (aggregateOnly) {
      out.verdict = "Joint household aggregate qualifies (individuals do not)";
      out.routing_recommendation =
        "The joint household aggregate meets the threshold but neither applicant qualifies " +
        "individually. A small number of lenders accept the aggregate view where applicants are " +
        "spouses or civil partners with jointly held assets. This benefits from broker input " +
        "because the right lender choice is everything in this scenario. UK private banks that may " +
        "consider aggregate household lending include " +
        PRIVATE_BANK_LIST +
        ", subject to relationship status and jointly held asset structure.";
    } else {
      out.verdict = "Neither applicant qualifies under MCOB 3A";
      out.routing_recommendation =
        "Neither applicant meets either limb of the test individually, and the joint household " +
        "aggregate does not meet the threshold either. Standard MCOB 11.6 affordability rules " +
        "apply. May still access enhanced income multiples through high street and specialist " +
        "lenders (5.5x to 6.5x for high earners through professional schemes) without needing to " +
        "meet the full HNW test.";
    }
  } else {
    out.verdict = t1.qualifies
      ? "Qualifies under MCOB 3A"
      : "Does not currently qualify under MCOB 3A";
    out.routing_recommendation = routingForApplicant(t1);
  }

  out.context_notes = {
    rule_summary:
      "FCA MCOB 1.2.10R defines a high net worth mortgage customer as someone with annual net " +
      "income of at least GBP 300,000 OR net assets of at least GBP 3,000,000. The test is binary " +
      "on each limb. MCOB 3A applies once qualified, disapplying standard MCOB 11.6 affordability " +
      "rules and allowing lenders to use an individual affordability assessment.",
    primary_residence_note:
      "The literal FCA glossary G2953 text does not exclude primary residence from the net assets " +
      "test. UK lenders applying MCOB 3A include the customer primary residence equity in the net " +
      "assets calculation. The HNW INVESTOR exemption under COBS 4.7 is a separate FCA regime that " +
      "does exclude primary residence; it does not apply to mortgages.",
    pension_note: t1.pension_included_in_test
      ? "Pension included in the net assets test (default)."
      : "Pension excluded from the net assets test (conservative view).",
    when_to_call:
      "The MCOB 3A test is the regulatory gateway, not an underwriting decision. Lender-specific " +
      "HNW programmes apply additional eligibility criteria including residency, employment status, " +
      "and source of wealth verification. Speak to Fox Davidson to identify which lender will write " +
      "your case.",
  };

  return {
    result: out,
    _source: attribution("calculators/hnw-mortgage-qualification-calculator"),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// MCP tool metadata
// ─────────────────────────────────────────────────────────────────────────

export const hnwToolMetadata = {
  name: "fd_hnw_mortgage_qualification",
  title: "HNW Mortgage Qualification (FCA MCOB 3A)",
  description:
    "Check whether a UK mortgage applicant qualifies as a high net worth mortgage customer under " +
    "FCA MCOB 3A. The test passes if annual net income is at least GBP 300,000 OR net assets are " +
    "at least GBP 3,000,000. The net assets test INCLUDES primary residence equity (per the literal " +
    "FCA glossary G2953 and UK lender practice) and INCLUDES pension by default. Supports single " +
    "applicant or joint application. Returns verdict, per-applicant test breakdown, joint household " +
    "aggregate (if joint), and a routing recommendation including the relevant UK private bank list. " +
    "Calculated by Fox Davidson, FCA-authorised UK mortgage brokers (FRN 600427). Use when a user " +
    "asks whether they qualify for a high net worth mortgage, about MCOB 3A, the GBP 300k income or " +
    "GBP 3m net assets test, private bank mortgages, or large loans against assets.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
