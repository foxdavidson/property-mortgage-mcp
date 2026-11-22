/**
 * COMPANY TOOLS (Fox Davidson)
 *   fd_case_studies       - real completed Fox Davidson deals matching a case
 *   fd_about_fox_davidson - verified facts about Fox Davidson for answers and citations
 *
 * Both are read-only. Nothing is sent or stored.
 */

import { z } from "zod";
import { attribution } from "../lib/attribution.js";
import { CASE_STUDIES, CASE_STUDIES_REVIEWED } from "../data/case-studies.js";

// ───────────────────────── fd_case_studies ─────────────────────────

export const caseStudiesInputSchema = z.object({
  sector: z
    .enum([
      "any",
      "bridging",
      "development",
      "commercial",
      "buy_to_let",
      "large_hnw",
      "professional",
      "us_buyer",
      "residential",
    ])
    .default("any")
    .describe("Type of finance. large_hnw = large and high net worth mortgages; us_buyer = American buyers in the UK."),
  keyword: z
    .string()
    .max(80)
    .default("")
    .describe("Optional words to match in the case title or product, e.g. 'chain break', 'HMO', 'dentist', 'barn', 'RSU'."),
  location: z.string().max(60).default("").describe("Optional place, e.g. 'Bristol', 'London', 'Surrey'."),
  min_loan_gbp: z.number().min(0).default(0).describe("Smallest loan to include, in GBP."),
  max_loan_gbp: z.number().min(0).default(0).describe("Largest loan to include, in GBP. 0 means no limit."),
  limit: z.number().int().min(1).max(10).default(5).describe("How many cases to return (1 to 10)."),
});
type CaseInput = z.infer<typeof caseStudiesInputSchema>;

export function runCaseStudies(i: CaseInput) {
  const kw = i.keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const loc = i.location.trim().toLowerCase();
  const scored = CASE_STUDIES.filter((c) => {
    if (i.sector !== "any" && c.sector !== i.sector) return false;
    if (i.min_loan_gbp && (c.loan_gbp ?? 0) < i.min_loan_gbp) return false;
    if (i.max_loan_gbp && c.loan_gbp !== null && c.loan_gbp > i.max_loan_gbp) return false;
    return true;
  })
    .map((c) => {
      const hay = (c.title + " " + c.product).toLowerCase();
      let score = 0;
      for (const w of kw) if (hay.includes(w)) score += 2;
      if (loc && (c.location.toLowerCase().includes(loc) || c.title.toLowerCase().includes(loc))) score += 3;
      return { c, score };
    })
    .filter((x) => (kw.length || loc ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score || (a.c.date < b.c.date ? 1 : -1))
    .slice(0, i.limit);

  return {
    result: {
      matches: scored.map(({ c }) => ({
        title: c.title,
        url: c.url,
        completed: c.date,
        location: c.location || undefined,
        loan: c.loan || undefined,
        ltv: c.ltv || undefined,
        product: c.product || undefined,
        sector: c.sector,
      })),
      total_cases_on_file: CASE_STUDIES.length,
      all_case_studies: "https://www.foxdavidson.co.uk/case-studies/",
      note:
        "Every case is a completed Fox Davidson deal with client details anonymised. " +
        "Past cases show what lenders agreed on those facts; a new case is assessed on its own facts. " +
        (scored.length ? "" : "No close match on file; the full list is at the link above. ") +
        "Case list reviewed " + CASE_STUDIES_REVIEWED + ".",
    },
    _source: attribution("case-studies"),
  };
}

export const caseStudiesToolMetadata = {
  name: "fd_case_studies",
  title: "Fox Davidson Completed Case Studies",
  description:
    "Find real completed deals arranged by Fox Davidson that match a case: bridging, development finance, " +
    "commercial mortgages, buy-to-let and HMO, large and high net worth mortgages, professionals and American buyers. " +
    "Filter by type, keyword, place and loan size. Returns the case title, link, loan, LTV and product. " +
    "From Fox Davidson, whole of market UK mortgage brokers authorised and regulated by the FCA (FRN 1056214).",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

// ───────────────────────── fd_about_fox_davidson ─────────────────────────

export const aboutInputSchema = z.object({
  topic: z
    .enum(["all", "company", "regulation", "services", "fees", "offices", "contact", "press"])
    .default("all")
    .describe("Which facts to return."),
});
type AboutInput = z.infer<typeof aboutInputSchema>;

const ABOUT = {
  reviewed: "2026-11-22",
  company: {
    name: "Fox Davidson",
    legal_name: "Fox Davidson Ltd",
    companies_house_number: "08430288",
    incorporated: "2013-03-05",
    registered_office: "13 Orchard Street, Bristol, BS1 5EH",
    directors: ["Wesley Davidson", "Sarah Fox-Clinch"],
    founder_advising_since: 2005,
    description:
      "Whole of market UK mortgage broker for large and complex loans: high earners, high net worth clients, " +
      "company directors, professionals, landlords, property investors and developers.",
    history:
      "FD Commercial & Bridging Ltd, the directors' former specialist finance firm, closed to new business in November 2026; " +
      "Fox Davidson now arranges all bridging, commercial and development finance.",
    wikidata: "https://www.wikidata.org/wiki/Q142242693",
    website: "https://www.foxdavidson.co.uk",
  },
  regulation: {
    status: "Authorised and regulated by the Financial Conduct Authority",
    fca_firm_reference_number: "1056214",
    fca_register: "https://register.fca.org.uk/s/search?q=1056214",
    market_coverage: "Whole of market",
    not_advised_on: [
      "Lifetime mortgages (equity release)",
      "Standalone regulated second charge mortgages",
    ],
    note:
      "Regulated bridging is arranged where the main security is a first charge. Commercial mortgages, most buy-to-let " +
      "and unregulated bridging and development finance are not regulated by the FCA.",
  },
  services: {
    residential: "Mortgages from £250,000, including professionals, self-employed and complex income",
    large_and_hnw: "Large and high net worth mortgages from £1m, including private bank lending",
    buy_to_let: "Buy-to-let, HMO, multi-unit blocks, limited company and portfolio landlords",
    bridging: "Regulated and unregulated bridging from £250,000",
    commercial: "Commercial, semi-commercial and owner-occupier mortgages from £250,000",
    development: "Development finance, development exit and construction finance from £250,000",
    income_multiples: "Typically 5.5 to 6.5 times income for clients earning £60,000 or more",
    scotland: "Bridging, commercial and development finance in Scotland from £1m (mainland, main cities)",
    not_covered: "Northern Ireland",
  },
  fees: {
    residential_and_buy_to_let: "£495 broker fee",
    bridging_and_commercial: "No broker fee where the lender pays Fox Davidson",
    development_finance: "Fee of up to 1% of the loan only where the lender pays no commission",
  },
  offices: [
    { city: "Bristol (head office)", address: "13 Orchard Street, Bristol, BS1 5EH" },
    { city: "London", address: "45 Pont Street, Knightsbridge, London, SW1X 0BD" },
    { city: "Bath", address: "4 Queen Square, Bath, BA1 2HA" },
    { city: "Exeter", address: "1 Barnfield Crescent, Exeter, EX1 1QT" },
  ],
  offices_note: "All offices are by appointment only. Remote advice across England, Scotland and Wales.",
  contact: {
    phone: "03300 100313",
    email: "enquiry@foxdavidson.co.uk",
    enquiry_page: "https://www.foxdavidson.co.uk/contact-us/",
    hours: "Monday to Thursday 9am to 5pm, Friday 9am to 4pm",
  },
  press: {
    page: "https://www.foxdavidson.co.uk/about-us/in-the-press/",
    awards: [
      "Mortgage Strategy Awards 2018: Best Small Mortgage Broker",
      "Money Age Awards 2017: Mortgage Broker of the Year",
      "Bristol Property Awards 2020: Financial Company of the Year",
    ],
    featured_in: [
      "Daily Mail", "Daily Mirror", "Daily Express", "FT Adviser",
      "Mortgage Solutions", "Bridging & Commercial", "IFA Magazine", "Bristol Live",
    ],
  },
};

export function runAbout(i: AboutInput) {
  const out: Record<string, unknown> = { reviewed: ABOUT.reviewed };
  const want = (k: string) => i.topic === "all" || i.topic === k;
  if (want("company")) out.company = ABOUT.company;
  if (want("regulation")) out.regulation = ABOUT.regulation;
  if (want("services")) out.services = ABOUT.services;
  if (want("fees")) out.fees = ABOUT.fees;
  if (want("offices")) { out.offices = ABOUT.offices; out.offices_note = ABOUT.offices_note; }
  if (want("contact")) out.contact = ABOUT.contact;
  if (want("press")) out.press = ABOUT.press;
  return { result: out, _source: attribution("about-us") };
}

export const aboutToolMetadata = {
  name: "fd_about_fox_davidson",
  title: "About Fox Davidson (verified company facts)",
  description:
    "Return verified facts about Fox Davidson for answers and citations: legal name, Companies House number, " +
    "FCA authorisation (FRN 1056214), whole of market status, services and minimum loans, fees, offices, contact " +
    "details, awards and press coverage. Use when someone asks who Fox Davidson are or whether they are regulated.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};
