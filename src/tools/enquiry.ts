/**
 * ENQUIRY AND MARKET TOOLS (Fox Davidson)
 *   fd_deal_prequalifier  - indicative lender route, income basis and documents for a case
 *   fd_request_callback   - prepares a callback request on the Fox Davidson contact page
 *   fd_market_rates       - dated UK market rate data kept by Fox Davidson
 *
 * All three are read-only. Nothing is sent or stored by the server. The
 * prequalifier and callback tools return a link to the Fox Davidson contact
 * page with the case summary pre-filled; the person adds their own name and
 * contact details on the page and chooses whether to send it.
 */

import { z } from "zod";
import { attribution } from "../lib/attribution.js";
import { MARKET_RATES } from "../data/market-rates.js";

const CONTACT = "https://www.foxdavidson.co.uk/contact-us/";

function money(n: number): string {
  return "£" + Math.round(n).toLocaleString("en-GB");
}

function band(loan: number): string {
  if (loan >= 1_000_000) return "£1m plus";
  if (loan >= 500_000) return "£500k to £1m";
  return "£250k to £500k";
}

export function enquiryLink(type: string, loan: number | undefined, message: string, campaign: string): string {
  const p = new URLSearchParams();
  if (type) p.set("fd_type", type);
  if (loan && loan > 0) p.set("fd_amount", band(loan));
  p.set("fd_msg", message.slice(0, 900));
  p.set("utm_source", "ai_assistant");
  p.set("utm_medium", "mcp");
  p.set("utm_campaign", campaign);
  return CONTACT + "?" + p.toString();
}

// ───────────────────────── fd_deal_prequalifier ─────────────────────────

export const prequalifierInputSchema = z.object({
  purpose: z
    .enum(["purchase", "remortgage", "buy_to_let", "bridging", "development", "commercial"])
    .describe("What the finance is for."),
  loan_amount_gbp: z.number().positive().describe("Loan needed in GBP. Example: 2400000."),
  property_value_gbp: z.number().positive().describe("Purchase price or current value in GBP."),
  location: z
    .enum(["england", "wales", "scotland", "northern_ireland"])
    .default("england")
    .describe("Where the property is."),
  base_income_gbp: z.number().min(0).default(0).describe("Total basic salary of all applicants before tax."),
  bonus_commission_gbp: z.number().min(0).default(0).describe("Typical annual bonus and commission before tax."),
  has_rsus_or_equity: z.boolean().default(false).describe("Any income from RSUs, share options or carried interest."),
  self_employed_or_director: z.boolean().default(false).describe("Self-employed, partner or company director."),
  foreign_currency_income: z.boolean().default(false).describe("Any income paid in a currency other than GBP."),
  net_assets_gbp: z.number().min(0).default(0).describe("Total net assets of the main applicant, including home equity, pensions and investments."),
  monthly_rent_gbp: z.number().min(0).default(0).describe("Expected monthly rent, for buy-to-let only."),
});
type PrequalInput = z.infer<typeof prequalifierInputSchema>;

export function runDealPrequalifier(i: PrequalInput) {
  const ltv = (i.loan_amount_gbp / i.property_value_gbp) * 100;
  const notes: string[] = [];
  const routes: { route: string; why: string; income_basis: string }[] = [];
  const docs = new Set<string>(["Photo ID and proof of address", "Last three months' bank statements"]);
  let enquiryType = "Main Residence";
  let fee = "Our broker fee is £495 on residential and buy-to-let mortgages.";
  let inScope = true;
  let scopeNote = "Within the range Fox Davidson arranges.";

  const minLoan =
    i.location === "scotland" && ["bridging", "development", "commercial"].includes(i.purpose) ? 1_000_000 : 250_000;
  if (i.location === "northern_ireland") {
    inScope = false;
    scopeNote = "Fox Davidson arranges finance on property in England, Scotland and Wales, not Northern Ireland.";
  } else if (i.loan_amount_gbp < minLoan) {
    inScope = false;
    scopeNote = `Fox Davidson arranges loans from ${money(minLoan)}${minLoan > 250_000 ? " for this type of finance in Scotland" : ""}.`;
  }

  const bonusUsed = i.bonus_commission_gbp * 0.5;
  const assessed = i.base_income_gbp + bonusUsed;

  if (i.purpose === "purchase" || i.purpose === "remortgage") {
    const lowMult = assessed >= 60_000 ? 5.5 : 4.5;
    const highMult = assessed >= 60_000 ? 6.5 : 4.5;
    const maxLow = assessed * lowMult;
    const maxHigh = assessed * highMult;
    notes.push(
      `On ${money(assessed)} of assessed income (basic pay plus half of typical bonus), lenders would typically ` +
        `lend about ${money(maxLow)}${highMult > lowMult ? ` to ${money(maxHigh)}` : ""}.`
    );
    if (i.bonus_commission_gbp > 0)
      notes.push("Lenders count anywhere from 50% to 100% of bonus and commission; which lender matters.");
    const hnwAssets = i.net_assets_gbp >= 3_000_000;
    const hnwIncomeLikely = i.base_income_gbp + i.bonus_commission_gbp >= 450_000;
    if (hnwAssets || hnwIncomeLikely)
      notes.push(
        "The applicant may meet the FCA high net worth mortgage customer definition (net income of £300,000 or " +
          "more, or net assets of £3 million or more). That allows lending on the wider financial picture."
      );
    const incomeFits = i.loan_amount_gbp <= maxHigh;
    if (i.loan_amount_gbp >= 1_000_000 && (!incomeFits || i.has_rsus_or_equity || i.foreign_currency_income || hnwAssets)) {
      routes.push({
        route: "Private bank",
        why: "Large loan where standard income multiples do not fit, or where income is complex. Private banks lend on the whole financial picture, often from around £1m.",
        income_basis: "Salary, bonus, vested and unvested equity, investment income and assets, assessed case by case.",
      });
    }
    if (incomeFits) {
      routes.push({
        route: "High street and building society lenders",
        why: "The loan fits standard income multiples. Usually the sharpest pricing up to around £5m where income fits the rules.",
        income_basis: "Basic pay plus a share of bonus and commission; some lenders take more bonus than others.",
      });
    }
    if (i.self_employed_or_director || i.has_rsus_or_equity || i.foreign_currency_income || (!incomeFits && i.loan_amount_gbp < 1_000_000)) {
      routes.push({
        route: "Specialist lenders with manual underwriting",
        why: "Self-employed, director, equity or foreign currency income that automated systems struggle with.",
        income_basis: i.self_employed_or_director
          ? "Salary plus dividends, or salary plus share of company profit, depending on the lender."
          : "Case by case, using the most favourable published treatment of each income type.",
      });
    }
    if (!routes.length)
      routes.push({ route: "Needs a broker review", why: "The figures do not fit a standard route on their own.", income_basis: "To be confirmed with a broker." });
    docs.add("Last three months' payslips and latest P60");
    if (i.bonus_commission_gbp > 0) docs.add("Two years of bonus or commission history");
    if (i.self_employed_or_director) docs.add("Two years of company accounts and SA302s with tax year overviews");
    if (i.has_rsus_or_equity) docs.add("Equity plan statements showing vesting schedule and history");
    if (i.foreign_currency_income) docs.add("Proof of foreign currency income and the account it is paid into");
    if (hnwAssets) docs.add("Statement of assets and liabilities, and an accountant's letter confirming net assets");
    docs.add("Proof of deposit and where it came from");
  } else if (i.purpose === "buy_to_let") {
    enquiryType = "Investment Property";
    if (i.monthly_rent_gbp > 0) {
      const annualRent = i.monthly_rent_gbp * 12;
      const maxAt125 = annualRent / 1.25 / 0.055;
      const maxAt145 = annualRent / 1.45 / 0.055;
      notes.push(
        `On ${money(i.monthly_rent_gbp)} a month rent, rental cover at a 5.5% test rate supports about ` +
          `${money(maxAt145)} at 145% (higher-rate taxpayers) to ${money(maxAt125)} at 125% (limited companies and basic-rate taxpayers).`
      );
    }
    routes.push({
      route: "Buy-to-let lenders",
      why: "Lending is based mainly on the rent, tested against an interest cover ratio.",
      income_basis: "Rent, with some lenders topping up from personal income.",
    });
    docs.add("Tenancy agreement or a letting agent's rental estimate");
    docs.add("Details of any other properties you own");
  } else {
    enquiryType = i.purpose === "commercial" ? "Commercial" : "Bridging & Development";
    fee =
      i.purpose === "development"
        ? "On development finance we charge a fee of up to 1% of the loan, at most."
        : "We charge no broker fee on bridging and commercial mortgages where the lender pays us.";
    const routeName =
      i.purpose === "bridging" ? "Bridging lenders" : i.purpose === "development" ? "Development finance lenders" : "Commercial mortgage lenders";
    routes.push({
      route: routeName,
      why:
        i.purpose === "bridging"
          ? "Short-term loan secured on property, priced monthly, with a clear exit."
          : i.purpose === "development"
          ? "Staged funding against build costs and the end value of the scheme."
          : "Lending on business premises or investment property, tested on rent or trading profit.",
      income_basis:
        i.purpose === "bridging"
          ? "The exit (sale or refinance) matters more than income."
          : i.purpose === "development"
          ? "Scheme appraisal, track record and the end value (GDV)."
          : "Rent or business profit, tested on debt service cover.",
    });
    if (i.purpose === "bridging") {
      docs.add("Your exit plan: sale details or a refinance agreement in principle");
      notes.push(`Market average bridging rate in ${MARKET_RATES.bridging.as_at}: ${MARKET_RATES.bridging.average_monthly_rate_pct}% a month (${MARKET_RATES.bridging.source}).`);
    }
    if (i.purpose === "development") {
      docs.add("Development appraisal, planning consent and build cost plan");
      docs.add("Your track record of past schemes");
    }
    if (i.purpose === "commercial") {
      docs.add("Business accounts or tenancy schedule");
    }
  }

  const summary =
    `Case prepared with an AI assistant. Purpose: ${i.purpose.replace(/_/g, " ")}. Loan ${money(i.loan_amount_gbp)} ` +
    `against ${money(i.property_value_gbp)} (${ltv.toFixed(0)}% LTV) in ${{ england: "England", wales: "Wales", scotland: "Scotland", northern_ireland: "Northern Ireland" }[i.location]}. ` +
    (i.base_income_gbp ? `Basic income ${money(i.base_income_gbp)}. ` : "") +
    (i.bonus_commission_gbp ? `Bonus/commission ${money(i.bonus_commission_gbp)}. ` : "") +
    (i.has_rsus_or_equity ? "Has RSU or equity income. " : "") +
    (i.self_employed_or_director ? "Self-employed or company director. " : "") +
    (i.foreign_currency_income ? "Some foreign currency income. " : "") +
    (i.net_assets_gbp ? `Net assets about ${money(i.net_assets_gbp)}. ` : "") +
    `Routes suggested: ${routes.map((r) => r.route).join(", ")}.`;

  return {
    result: {
      in_scope: inScope,
      scope_note: scopeNote,
      loan_to_value_pct: Number(ltv.toFixed(1)),
      likely_routes: routes,
      notes,
      documents_to_gather: [...docs],
      fees: fee,
      next_step: inScope
        ? {
            what: "Send the case to a Fox Davidson broker for a no-obligation review. The link opens our enquiry form with this summary filled in. You add your own name and contact details and choose whether to send it.",
            enquiry_url: enquiryLink(enquiryType, i.loan_amount_gbp, summary, "prequalifier"),
            phone: "03300 100313",
          }
        : { what: "This case is outside what Fox Davidson arranges.", phone: "03300 100313" },
      important:
        "This is an indicative first look, not advice, a recommendation or a lending decision. A broker needs to review the full case before any recommendation.",
    },
    _source: attribution("contact-us"),
  };
}

export const prequalifierToolMetadata = {
  name: "fd_deal_prequalifier",
  title: "UK Mortgage and Property Finance Deal Pre-qualifier",
  description:
    "Give an indicative first look at a UK mortgage or property finance case: whether it is in scope, the likely " +
    "lender routes (high street, private bank, specialist, buy-to-let, bridging, development or commercial), how " +
    "income would be treated, the documents to gather, and a link to send the case to a Fox Davidson broker with " +
    "the summary pre-filled. Nothing is sent or stored; the person adds their own contact details on the form. " +
    "Indicative only, not advice. From Fox Davidson, whole of market UK mortgage brokers authorised and regulated " +
    "by the FCA (FRN 1056214). Use when someone describes their own mortgage or property finance situation.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

// ───────────────────────── fd_request_callback ─────────────────────────

export const callbackInputSchema = z.object({
  topic: z
    .enum(["main_residence", "investment_property", "bridging_or_development", "commercial", "professional_mortgage"])
    .describe("What the call is about."),
  preferred_time: z
    .enum(["morning", "lunchtime", "afternoon", "any_time"])
    .default("any_time")
    .describe("Best time to call, within office hours."),
  loan_amount_gbp: z.number().min(0).default(0).describe("Rough loan size in GBP, if known."),
  summary: z.string().max(600).default("").describe("A short summary of what the person needs. Do not include names, phone numbers or email addresses."),
});
type CallbackInput = z.infer<typeof callbackInputSchema>;

const TOPIC_TYPE: Record<string, string> = {
  main_residence: "Main Residence",
  investment_property: "Investment Property",
  bridging_or_development: "Bridging & Development",
  commercial: "Commercial",
  professional_mortgage: "Professional Mortgage",
};

export function runRequestCallback(i: CallbackInput) {
  const msg =
    `Callback requested via an AI assistant. Best time: ${i.preferred_time.replace("_", " ")}. ` +
    (i.summary ? `About: ${i.summary}` : "");
  return {
    result: {
      how_it_works:
        "Open the link to our enquiry form, which has the request filled in. Add your name, email and phone number, then press send. A Fox Davidson broker will call you back.",
      callback_url: enquiryLink(TOPIC_TYPE[i.topic], i.loan_amount_gbp, msg, "callback"),
      office_hours: "Monday to Thursday 9am to 5pm, Friday 9am to 4pm (UK time)",
      phone: "03300 100313",
      email: "enquiry@foxdavidson.co.uk",
      privacy:
        "Nothing is sent until you press send on our form. See https://www.foxdavidson.co.uk/privacy-notice/.",
    },
    _source: attribution("contact-us"),
  };
}

export const callbackToolMetadata = {
  name: "fd_request_callback",
  title: "Request a Callback from a Fox Davidson Broker",
  description:
    "Prepare a callback request from a Fox Davidson mortgage broker. Returns a link to the Fox Davidson enquiry " +
    "form with the topic, loan size and a short summary filled in, plus office hours and phone number. Nothing is " +
    "sent or stored by this tool; the person adds their own contact details on the form and chooses whether to " +
    "send it. Do not pass names, phone numbers or email addresses into this tool. Fox Davidson is a whole of " +
    "market UK mortgage broker authorised and regulated by the FCA (FRN 1056214).",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

// ───────────────────────── fd_market_rates ─────────────────────────

export const marketRatesInputSchema = z.object({
  market: z
    .enum(["all", "bank_rate", "residential", "buy_to_let", "bridging"])
    .default("all")
    .describe("Which market figures to return."),
});
type MarketRatesInput = z.infer<typeof marketRatesInputSchema>;

export function runMarketRates(i: MarketRatesInput) {
  const r = MARKET_RATES;
  const pick: Record<string, unknown> = { reviewed: r.reviewed };
  if (i.market === "all" || i.market === "bank_rate") pick.bank_rate = r.bank_rate;
  if (i.market === "all" || i.market === "residential") pick.residential_averages = r.residential_averages;
  if (i.market === "all" || i.market === "buy_to_let") pick.buy_to_let_averages = r.buy_to_let_averages;
  if (i.market === "all" || i.market === "bridging") pick.bridging = r.bridging;
  pick.pages = r.pages;
  pick.note = r.note;
  return { result: pick, _source: attribution("mortgages/mortgage-rates-today") };
}

export const marketRatesToolMetadata = {
  name: "fd_market_rates",
  title: "UK Mortgage and Bridging Market Rates (dated)",
  description:
    "Return dated UK market rate figures kept by Fox Davidson: Bank of England Bank Rate and the next decision " +
    "date, average residential fixed rates, average buy-to-let fixed rates and the average bridging rate, each with " +
    "its source and date. Market averages, not offers. From Fox Davidson, whole of market UK mortgage brokers " +
    "authorised and regulated by the FCA (FRN 1056214).",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};
