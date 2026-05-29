/**
 * UK stamp duty / land tax bands and surcharges.
 *
 * Locked to 2026 values matching HMRC (SDLT), Revenue Scotland (LBTT)
 * and the Welsh Revenue Authority (LTT). Mirrors the live Fox Davidson
 * stamp duty calculator at /calculators/stamp-duty-calculator/ so web
 * and MCP outputs are identical.
 */

export interface Band {
  /** Upper bound of this band (inclusive lower bound is the previous band's upTo). */
  upTo: number;
  /** Marginal rate applied to the portion of price within this band. */
  rate: number;
}

export interface BandLine {
  band_label: string;
  rate_pct: number;
  portion_gbp: number;
  tax_gbp: number;
}

export interface BandedResult {
  total: number;
  breakdown: BandLine[];
}

// 2026 SDLT England & Northern Ireland residential bands
export const SDLT_RES: Band[] = [
  { upTo: 125000, rate: 0 },
  { upTo: 250000, rate: 0.02 },
  { upTo: 925000, rate: 0.05 },
  { upTo: 1500000, rate: 0.1 },
  { upTo: Infinity, rate: 0.12 },
];

// 2026 SDLT first-time buyer (relief cap GBP 500,000)
export const SDLT_FTB: Band[] = [
  { upTo: 300000, rate: 0 },
  { upTo: 500000, rate: 0.05 },
];
export const SDLT_FTB_CAP = 500000;

// 2026 SDLT non-residential / mixed-use
export const SDLT_COM: Band[] = [
  { upTo: 150000, rate: 0 },
  { upTo: 250000, rate: 0.02 },
  { upTo: Infinity, rate: 0.05 },
];

// 2026 LBTT Scotland residential
export const LBTT_RES: Band[] = [
  { upTo: 145000, rate: 0 },
  { upTo: 250000, rate: 0.02 },
  { upTo: 325000, rate: 0.05 },
  { upTo: 750000, rate: 0.1 },
  { upTo: Infinity, rate: 0.12 },
];

// 2026 LBTT first-time buyer (0% to GBP 175,000)
export const LBTT_FTB: Band[] = [
  { upTo: 175000, rate: 0 },
  { upTo: 250000, rate: 0.02 },
  { upTo: 325000, rate: 0.05 },
  { upTo: 750000, rate: 0.1 },
  { upTo: Infinity, rate: 0.12 },
];

// 2026 LBTT non-residential / mixed-use
export const LBTT_COM: Band[] = [
  { upTo: 150000, rate: 0 },
  { upTo: 250000, rate: 0.01 },
  { upTo: Infinity, rate: 0.05 },
];

// 2026 LTT Wales residential
export const LTT_RES: Band[] = [
  { upTo: 225000, rate: 0 },
  { upTo: 400000, rate: 0.06 },
  { upTo: 750000, rate: 0.075 },
  { upTo: 1500000, rate: 0.1 },
  { upTo: Infinity, rate: 0.12 },
];

// 2026 LTT non-residential / mixed-use
export const LTT_COM: Band[] = [
  { upTo: 225000, rate: 0 },
  { upTo: 250000, rate: 0.01 },
  { upTo: 1000000, rate: 0.05 },
  { upTo: Infinity, rate: 0.06 },
];

// Surcharges (2026)
export const ADS_SDLT = 0.05; // England/NI additional dwelling (raised from 3% on 31 Oct 2024)
export const ADS_LBTT = 0.08; // Scotland Additional Dwelling Supplement (raised from 6% on 5 Dec 2024)
export const ADS_LTT = 0.05; // Wales higher-rate surcharge (raised from 4% in Dec 2024)
export const NONRES_SURCHARGE_SDLT = 0.02; // England/NI non-UK resident surcharge
export const CORPORATE_FLAT = 0.17; // England/NI corporate flat (raised from 15% on 31 Oct 2024)
export const CORPORATE_THRESHOLD = 500000;

/**
 * Apply a banded (slab) tax calculation, optionally adding a flat extra
 * rate to every band (used for additional-dwelling and non-resident
 * surcharges that apply across all bands).
 */
export function calcBands(price: number, bands: Band[], extraRate = 0): BandedResult {
  let remaining = price;
  let lower = 0;
  let total = 0;
  const breakdown: BandLine[] = [];

  for (let i = 0; i < bands.length && remaining > 0; i++) {
    const b = bands[i];
    const portion = Math.min(remaining, b.upTo - lower);
    if (portion <= 0) break;
    const rateUsed = b.rate + extraRate;
    const tax = portion * rateUsed;
    total += tax;
    breakdown.push({
      band_label:
        "GBP " +
        lower.toLocaleString("en-GB") +
        " to GBP " +
        Math.min(b.upTo, price).toLocaleString("en-GB"),
      rate_pct: Number((rateUsed * 100).toFixed(2)),
      portion_gbp: Math.round(portion),
      tax_gbp: Math.round(tax),
    });
    remaining -= portion;
    lower = b.upTo;
  }

  return { total, breakdown };
}
