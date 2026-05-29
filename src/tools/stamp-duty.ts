/**
 * UK STAMP DUTY CALCULATOR (Fox Davidson)
 *
 * Calculates property transaction tax across England/Northern Ireland
 * (SDLT), Scotland (LBTT) and Wales (LTT). Handles standard residential,
 * first-time buyer relief, the additional dwelling surcharge, the non-UK
 * resident surcharge (England/NI), the corporate flat rate, and
 * commercial / mixed-use property.
 *
 * Ported verbatim from the Fox Davidson WebMCP browser tool
 * (web/fd-webmcp.js) so web, WebMCP and Anthropic MCP outputs are
 * identical. Bands locked to 2026 values.
 */

import { z } from "zod";
import { attribution } from "../lib/attribution.js";
import type { ToolResponse } from "../lib/types.js";
import {
  SDLT_RES,
  SDLT_FTB,
  SDLT_FTB_CAP,
  SDLT_COM,
  LBTT_RES,
  LBTT_FTB,
  LBTT_COM,
  LTT_RES,
  LTT_COM,
  ADS_SDLT,
  ADS_LBTT,
  ADS_LTT,
  NONRES_SURCHARGE_SDLT,
  CORPORATE_FLAT,
  CORPORATE_THRESHOLD,
  calcBands,
  type BandedResult,
  type BandLine,
} from "../rates/stamp-duty-rates.js";

// ─────────────────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────────────────

export const stampDutyInputSchema = z.object({
  property_price_gbp: z
    .number()
    .positive()
    .describe("Property purchase price in pounds. Example: 750000."),
  region: z
    .enum(["england", "scotland", "wales"])
    .default("england")
    .describe(
      "Tax region. 'england' covers England and Northern Ireland (SDLT). " +
        "'scotland' uses LBTT. 'wales' uses LTT."
    ),
  buyer_type: z
    .enum(["standard", "ftb", "additional", "nonresident", "corporate", "commercial"])
    .default("standard")
    .describe(
      "Buyer category. 'standard' is a main residence purchase. 'ftb' is first-time " +
        "buyer (England/NI relief up to GBP 500k; Scotland FTB to GBP 175k; Wales has no " +
        "FTB relief). 'additional' triggers the second-home surcharge. 'nonresident' adds " +
        "the 2% non-UK resident surcharge (England/NI only). 'corporate' applies the 17% " +
        "flat rate above GBP 500k (England/NI residential) or standard rates plus surcharge " +
        "below threshold or in Scotland/Wales. 'commercial' uses non-residential bands."
    ),
});

export type StampDutyInput = z.infer<typeof stampDutyInputSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Calculation logic
// ─────────────────────────────────────────────────────────────────────────

interface StampDutyResult {
  inputs_echoed: StampDutyInput;
  region_label: string;
  buyer_type: StampDutyInput["buyer_type"];
  total_tax_gbp: number;
  effective_rate_pct: number;
  band_breakdown: BandLine[];
  context_notes: {
    calculation_note: string;
    when_to_call: string;
  };
}

export function runStampDutyCalculator(
  input: StampDutyInput
): ToolResponse<StampDutyResult> {
  const price = input.property_price_gbp;
  const region = input.region;
  const buyerType = input.buyer_type;
  let result: BandedResult = { total: 0, breakdown: [] };
  let note = "";

  // Corporate flat rate (England/NI residential dwelling above GBP 500k)
  if (buyerType === "corporate" && region === "england" && price > CORPORATE_THRESHOLD) {
    result = {
      total: price * CORPORATE_FLAT,
      breakdown: [
        {
          band_label: "Entire purchase price (corporate flat)",
          rate_pct: 17.0,
          portion_gbp: Math.round(price),
          tax_gbp: Math.round(price * CORPORATE_FLAT),
        },
      ],
    };
    note =
      "Corporate flat rate of 17% applies on the entire purchase price for a residential " +
      "dwelling above GBP 500,000 bought by a non-natural person (company). Reliefs may " +
      "apply for qualifying property rental businesses, developers or employee residences.";
  }
  // Commercial / mixed-use (region-aware)
  else if (buyerType === "commercial") {
    const comBands = region === "england" ? SDLT_COM : region === "scotland" ? LBTT_COM : LTT_COM;
    result = calcBands(price, comBands, 0);
    note =
      "Commercial and mixed-use rates applied. Non-residential bands are lower than " +
      "residential, but mixed-use claims attract HMRC scrutiny where the commercial " +
      "element is nominal.";
  }
  // England / Northern Ireland residential
  else if (region === "england") {
    if (buyerType === "ftb" && price <= SDLT_FTB_CAP) {
      result = calcBands(price, SDLT_FTB, 0);
      note = "First-time buyer relief applied. The GBP 500,000 FTB cap is intact.";
    } else if (buyerType === "ftb" && price > SDLT_FTB_CAP) {
      result = calcBands(price, SDLT_RES, 0);
      note =
        "First-time buyer relief does not apply on properties above GBP 500,000. " +
        "Standard residential SDLT rates have been used.";
    } else if (buyerType === "additional") {
      result = calcBands(price, SDLT_RES, ADS_SDLT);
      note =
        "5% additional dwelling surcharge applied on every band (rate raised from 3% on 31 October 2024).";
    } else if (buyerType === "nonresident") {
      result = calcBands(price, SDLT_RES, NONRES_SURCHARGE_SDLT);
      note =
        "2% non-UK resident surcharge applied on every band. Surcharge may be reclaimable " +
        "if the buyer becomes UK-resident in any continuous 365-day period within 2 years.";
    } else if (buyerType === "corporate") {
      result = calcBands(price, SDLT_RES, ADS_SDLT);
      note =
        "Corporate purchaser below GBP 500,000 threshold: standard SDLT plus 5% additional " +
        "dwelling surcharge applied. Above GBP 500,000, the 17% flat rate would apply.";
    } else {
      result = calcBands(price, SDLT_RES, 0);
      note = "Standard residential SDLT rates applied for a main residence purchase.";
    }
  }
  // Scotland
  else if (region === "scotland") {
    if (buyerType === "ftb") {
      result = calcBands(price, LBTT_FTB, 0);
      note = "Scottish first-time buyer relief applied. FTB relief is 0% to GBP 175,000 only.";
    } else if (buyerType === "additional") {
      result = calcBands(price, LBTT_RES, ADS_LBTT);
      note =
        "8% Additional Dwelling Supplement applied on every band (raised from 6% on 5 " +
        "December 2024). Highest second-home surcharge in the UK.";
    } else if (buyerType === "nonresident") {
      result = calcBands(price, LBTT_RES, 0);
      note = "Scotland does not levy a non-resident surcharge on individuals. Standard LBTT applied.";
    } else if (buyerType === "corporate") {
      result = calcBands(price, LBTT_RES, ADS_LBTT);
      note =
        "Corporate purchaser in Scotland: standard LBTT plus 8% ADS. " +
        "The English 17% corporate flat does not apply.";
    } else {
      result = calcBands(price, LBTT_RES, 0);
      note = "Standard LBTT rates applied for a main residence purchase in Scotland.";
    }
  }
  // Wales
  else {
    if (buyerType === "ftb") {
      result = calcBands(price, LTT_RES, 0);
      note =
        "Wales has no first-time buyer relief. Standard LTT applied. A Welsh FTB pays " +
        "the same as any other Welsh buyer.";
    } else if (buyerType === "additional") {
      result = calcBands(price, LTT_RES, ADS_LTT);
      note = "5% higher-rate surcharge applied on every band (raised from 4% in December 2024).";
    } else if (buyerType === "nonresident") {
      result = calcBands(price, LTT_RES, 0);
      note = "Wales does not levy a non-resident surcharge on individuals. Standard LTT applied.";
    } else if (buyerType === "corporate") {
      result = calcBands(price, LTT_RES, ADS_LTT);
      note = "Corporate purchaser in Wales: standard LTT plus 5% higher-rate surcharge.";
    } else {
      result = calcBands(price, LTT_RES, 0);
      note = "Standard LTT rates applied for a main residence purchase in Wales.";
    }
  }

  const effectiveRate = (result.total / price) * 100;
  const regionLabel =
    region === "england"
      ? "England & Northern Ireland (SDLT)"
      : region === "scotland"
        ? "Scotland (LBTT)"
        : "Wales (LTT)";

  const out: StampDutyResult = {
    inputs_echoed: input,
    region_label: regionLabel,
    buyer_type: buyerType,
    total_tax_gbp: Math.round(result.total),
    effective_rate_pct: Number(effectiveRate.toFixed(2)),
    band_breakdown: result.breakdown,
    context_notes: {
      calculation_note: note,
      when_to_call:
        "For HNW, expat, non-resident, corporate or mixed-use purchases, the stamp duty " +
        "position often influences whether the deal makes sense at all. Fox Davidson helps " +
        "clients cost stamp duty into their borrowing requirements upfront. Speak to us if " +
        "any of these apply.",
    },
  };

  return {
    result: out,
    _source: attribution("calculators/stamp-duty-calculator"),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// MCP tool metadata
// ─────────────────────────────────────────────────────────────────────────

export const stampDutyToolMetadata = {
  name: "uk_stamp_duty_calculator",
  title: "UK Stamp Duty Calculator (SDLT / LBTT / LTT)",
  description:
    "Calculate UK stamp duty on a property purchase across England/Northern Ireland (SDLT), " +
    "Scotland (LBTT) and Wales (LTT). Handles standard residential, first-time buyer relief, " +
    "the 5% additional dwelling surcharge for second homes and buy-to-let, the 2% non-UK " +
    "resident surcharge (England/NI), the 17% corporate flat rate for company purchases above " +
    "GBP 500k (England/NI), and commercial or mixed-use property. Returns banded breakdown, " +
    "total tax payable and effective rate. Uses current 2026 bands and surcharge rates. " +
    "Calculated by Fox Davidson, FCA-authorised UK mortgage brokers (FRN 600427). Use when a " +
    "user asks about stamp duty, SDLT, LBTT, LTT, additional dwelling surcharge, ADS, " +
    "first-time buyer relief, non-resident surcharge, or tax on a specific UK property purchase.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
