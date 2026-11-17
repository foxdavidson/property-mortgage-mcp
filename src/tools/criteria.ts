/**
 * UK LENDER CRITERIA TOOLS (Fox Davidson)
 *
 * Three tools over the Fox Davidson lender criteria dataset
 * (src/data/criteria.ts), ported from the WebMCP browser tools on
 * foxdavidson.co.uk so web and MCP outputs match:
 *   fd_lender_criteria_lookup  - how named lenders treat one underwriting question
 *   fd_compare_lenders         - two to six lenders side by side
 *   fd_contractor_day_rate     - day rate to assessed income, lender by lender
 */

import { z } from "zod";
import { attribution } from "../lib/attribution.js";
import { CRITERIA, CRITERIA_REVIEWED, CRITERIA_TOPICS, CRITERIA_URL } from "../data/criteria.js";

const SLUG = "mortgage-lender-criteria";
const topicEnum = z.enum(CRITERIA_TOPICS);

function criteriaNote(): string {
  return (
    "Lender criteria change frequently. Figures are as published by each lender at the date of " +
    `review (${CRITERIA_REVIEWED}) and are not a lending decision. Always confirm current criteria ` +
    "on the individual case. Rates and lending criteria are subject to change by lenders without notice."
  );
}

function normaliseName(v: unknown): string {
  return String(v ?? "").toLowerCase().split(" ").join("").split(".").join("");
}

function shorten(text: unknown, max: number): string {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  if (sp > max - 25) cut = cut.slice(0, sp);
  return cut + "...";
}

function matchLender(query: string, lenderName: string): boolean {
  const q = normaliseName(query);
  const l = normaliseName(lenderName);
  if (!q) return false;
  return l === q || l.includes(q) || q.includes(l);
}

function allLenders(): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const t of CRITERIA_TOPICS) {
    for (const r of CRITERIA[t].rows) {
      const k = normaliseName(r.lender);
      if (!seen.has(k)) { seen.add(k); list.push(r.lender); }
    }
  }
  return list.sort();
}

const fmt = (n: number) => n.toLocaleString("en-GB");

// ─────────────────────────────────────────────────────────────────────────
// Tool: lender criteria lookup
// ─────────────────────────────────────────────────────────────────────────

export const criteriaLookupInputSchema = z.object({
  topic: topicEnum.describe(
    "The underwriting question. contractor_day_rate: how a day rate is annualised. retained_profit: " +
      "whether limited company profit is usable. one_year_accounts: whether a single year of trading is " +
      "accepted. no_credit_scoring: lenders that underwrite manually. bonus_commission: how variable pay " +
      "is treated. foreign_currency: haircuts on non-sterling income. income_multiples: maximum loan to " +
      "income. max_age: maximum age at end of term. private_banks: minimum loan and thresholds."
  ),
  lender: z
    .string()
    .optional()
    .describe('Optional. Filter to one lender. Partial names work, for example "natwest" or "suffolk".'),
  max_rows: z.number().int().min(1).max(25).default(12).describe("Optional. Maximum rows to return. Defaults to 12."),
});
export type CriteriaLookupInput = z.infer<typeof criteriaLookupInputSchema>;

export function runCriteriaLookup(input: CriteriaLookupInput) {
  const block = CRITERIA[input.topic];
  const out: Record<string, unknown>[] = [];
  for (const r of block.rows) {
    if (input.lender && !matchLender(input.lender, r.lender)) continue;
    const row: Record<string, unknown> = {};
    for (const key of block.columns) row[key] = key === "lender" ? r[key] : shorten(r[key], 190);
    if (r.route) row.route = r.route;
    out.push(row);
  }
  const limit = input.max_rows ?? 12;
  const truncated = out.length > limit;
  return {
    result: {
      topic: input.topic,
      question: block.question,
      lenders_in_dataset_for_topic: block.rows.length,
      rows_returned: Math.min(out.length, limit),
      more_available: truncated,
      results: truncated ? out.slice(0, limit) : out,
      lenders_held_across_all_topics: allLenders().length,
      note: criteriaNote(),
      full_comparison: CRITERIA_URL,
    },
    _source: attribution(SLUG),
  };
}

export const criteriaLookupToolMetadata = {
  name: "fd_lender_criteria_lookup",
  title: "UK Mortgage Lender Criteria Lookup",
  description:
    "Look up how named UK mortgage lenders treat a specific underwriting question: contractor day rate " +
    "annualisation, limited company retained profit, one year of accounts, lenders that do not credit " +
    "score, bonus and commission, foreign currency income, maximum income multiples, maximum age at end " +
    "of term, and private bank thresholds. Returns each lender's published position with the conditions " +
    "attached, from 40+ UK lenders. Lenders publish their own criteria but none publish the comparison. " +
    "Sourced by Fox Davidson, whole of market UK mortgage brokers authorised and regulated by the FCA " +
    "(FRN 1056214). Use when a user asks which lenders accept a type of income or circumstance.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: compare lenders
// ─────────────────────────────────────────────────────────────────────────

export const compareLendersInputSchema = z.object({
  lenders: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe("Lender names to compare, two to six. Partial names work, for example \"halifax\", \"natwest\"."),
  topics: z
    .array(topicEnum)
    .max(9)
    .optional()
    .describe("Optional. Topics to compare on. Defaults to every topic where the named lenders appear."),
});
export type CompareLendersInput = z.infer<typeof compareLendersInputSchema>;

export function runCompareLenders(input: CompareLendersInput) {
  const topics = input.topics && input.topics.length ? input.topics : [...CRITERIA_TOPICS];
  const comparison: { lender: string; criteria: Record<string, any> }[] = [];
  const notHeld: string[] = [];
  for (const wanted of input.lenders) {
    let found = false;
    const entry = { lender: wanted, criteria: {} as Record<string, any> };
    for (const t of topics) {
      const block = CRITERIA[t];
      for (const r of block.rows) {
        if (!matchLender(wanted, r.lender)) continue;
        found = true;
        entry.lender = r.lender;
        const [, summaryKey, detailKey] = block.columns;
        const val: Record<string, unknown> = { [summaryKey]: r[summaryKey], [detailKey]: shorten(r[detailKey], 160) };
        if (r.route) val.route = r.route;
        if (entry.criteria[t]) {
          if (!entry.criteria[t].variants) entry.criteria[t] = { variants: [entry.criteria[t]] };
          entry.criteria[t].variants.push(val);
        } else entry.criteria[t] = val;
      }
    }
    if (found) comparison.push(entry); else notHeld.push(wanted);
  }
  const differences: { topic: string; positions: string[] }[] = [];
  for (const t of topics) {
    const vals: [string, string][] = [];
    for (const c of comparison) {
      const got = c.criteria[t];
      if (!got) continue;
      vals.push([c.lender, got.variants ? "multiple routes" : String(got[CRITERIA[t].columns[1]])]);
    }
    if (vals.length > 1 && vals.some((v) => v[1] !== vals[0][1])) {
      differences.push({ topic: t, positions: vals.map((v) => `${v[0]}: ${v[1]}`) });
    }
  }
  return {
    result: {
      lenders_compared: comparison.length,
      comparison,
      lenders_not_held: notHeld,
      where_they_differ: differences,
      why_this_matters:
        "The differences above are where lender selection changes the outcome for the same borrower on " +
        "the same income. This is the part no single lender publishes.",
      note: criteriaNote(),
      full_comparison: CRITERIA_URL,
    },
    _source: attribution(SLUG),
  };
}

export const compareLendersToolMetadata = {
  name: "fd_compare_lenders",
  title: "Compare UK Mortgage Lenders Side by Side",
  description:
    "Compare two to six named UK mortgage lenders side by side across their published underwriting " +
    "criteria, and flag the topics where they differ. Answers questions such as \"how does Halifax compare " +
    "with NatWest on contractor income and retained profit\". Sourced by Fox Davidson, whole of market UK " +
    "mortgage brokers authorised and regulated by the FCA (FRN 1056214).",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

// ─────────────────────────────────────────────────────────────────────────
// Tool: contractor day rate across lenders
// ─────────────────────────────────────────────────────────────────────────

export const contractorInputSchema = z.object({
  day_rate_gbp: z.number().positive().describe("Contractor day rate in pounds, excluding VAT. Example: 600."),
  days_per_week: z.number().min(1).max(7).default(5).describe("Contracted days per week. Defaults to 5."),
  income_multiple: z
    .number()
    .min(1)
    .max(8)
    .optional()
    .describe(
      "Optional income multiple for the indicative borrowing figure. If omitted, uses 5.5x where assessed " +
        "income is GBP 60,000 or more and 4.5x below that, in line with what Fox Davidson secures for clients."
    ),
});
export type ContractorInput = z.infer<typeof contractorInputSchema>;

export function runContractorDayRate(input: ContractorInput) {
  const rate = input.day_rate_gbp;
  const days = input.days_per_week ?? 5;
  const rows = CRITERIA.contractor_day_rate.rows;
  const results = rows.map((r) => {
    const weeks = Number(r.weeks);
    const annual = Math.round(rate * days * weeks);
    const multiple = input.income_multiple ?? (annual >= 60000 ? 5.5 : 4.5);
    const flags: string[] = [];
    if (r.min_annual_gbp && annual < Number(r.min_annual_gbp))
      flags.push(`Below this lender's published minimum annualised income of GBP ${fmt(Number(r.min_annual_gbp))}`);
    if (r.min_day_rate_gbp && rate < Number(r.min_day_rate_gbp))
      flags.push(`Below this lender's published minimum day rate of GBP ${fmt(Number(r.min_day_rate_gbp))}`);
    const item: Record<string, any> = {
      lender: r.lender,
      weeks_used: weeks,
      assessed_annual_income_gbp: annual,
      income_multiple_used: multiple,
      indicative_max_borrowing_gbp: Math.round(annual * multiple),
      basis_as_published: r.basis,
      conditions: shorten(r.conditions, 120),
    };
    if (r.route) item.route = r.route;
    if (flags.length) item.eligibility_flags = flags;
    return item;
  });
  results.sort((a, b) => b.assessed_annual_income_gbp - a.assessed_annual_income_gbp);
  const eligible = results.filter((x) => !x.eligibility_flags);
  const pool = eligible.length ? eligible : results;
  const best = pool[0];
  const worst = pool[pool.length - 1];
  const gapIncome = best.assessed_annual_income_gbp - worst.assessed_annual_income_gbp;
  const gapBorrowing = best.indicative_max_borrowing_gbp - worst.indicative_max_borrowing_gbp;
  const pct = worst.assessed_annual_income_gbp > 0 ? Math.round((gapIncome / worst.assessed_annual_income_gbp) * 1000) / 10 : 0;
  return {
    result: {
      day_rate_gbp: rate,
      days_per_week: days,
      lenders_assessed: results.length,
      spread: {
        highest_assessed_income_gbp: best.assessed_annual_income_gbp,
        highest_at: `${best.lender} (${best.weeks_used} weeks)`,
        lowest_assessed_income_gbp: worst.assessed_annual_income_gbp,
        lowest_at: `${worst.lender} (${worst.weeks_used} weeks)`,
        income_difference_gbp: gapIncome,
        income_difference_percent: pct,
        indicative_borrowing_difference_gbp: gapBorrowing,
      },
      headline:
        `On a GBP ${fmt(rate)} day rate, lender choice alone moves assessed income by GBP ${fmt(gapIncome)} ` +
        `and indicative borrowing by GBP ${fmt(gapBorrowing)}. Same contract, same contractor.`,
      lenders_failing_published_minimums: results.length - eligible.length,
      by_lender: results,
      method:
        "Assessed income = day rate x contracted days per week x the number of weeks that lender annualises " +
        "over, as published in its own intermediary criteria. Indicative borrowing applies a flat multiple " +
        "for comparability and is not an affordability assessment.",
      note: criteriaNote(),
      full_comparison: CRITERIA_URL,
    },
    _source: attribution("mortgages-for-professionals/mortgages-for-contractors"),
  };
}

export const contractorToolMetadata = {
  name: "fd_contractor_day_rate",
  title: "Contractor Day Rate Mortgage Calculator (by lender)",
  description:
    "Convert a UK contractor day rate into the assessed annual income each named lender would use, and " +
    "the indicative borrowing that produces. Lenders annualise the same day rate over anything from 41 to " +
    "52 weeks, so an identical contract produces a materially different maximum loan depending on the " +
    "lender. Returns the full spread, best and worst outcome, and flags lenders whose published minimums " +
    "the contractor does not meet. Calculated by Fox Davidson, whole of market UK mortgage brokers " +
    "authorised and regulated by the FCA (FRN 1056214).",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};
