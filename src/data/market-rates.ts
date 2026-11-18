/**
 * Dated UK market rate data, kept by Fox Davidson.
 * One source for the fd_market_rates tool and for
 * https://www.foxdavidson.co.uk/agents/rates.json.
 * Update monthly with the rate pages refresh.
 */
export const MARKET_RATES = {
  reviewed: "2026-11-18",
  bank_rate: {
    rate_pct: 4.0,
    last_change: "2026-11-05",
    last_decision: "Raised from 3.75% to 4% on 5 November 2026 (8 to 1 vote).",
    next_decision: "2026-12-17",
    source: "Bank of England",
    source_url: "https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate",
  },
  residential_averages: {
    as_at: "early November 2026",
    source: "Moneyfacts",
    all_fixed_pct: 5.89,
    two_year_fixed_pct: 5.97,
    five_year_fixed_pct: 6.0,
    ten_year_fixed_pct: 6.32,
    standard_variable_rate_pct: 7.13,
  },
  buy_to_let_averages: {
    as_at: "mid October 2026",
    source: "Moneyfacts",
    two_year_fixed_pct: 5.63,
    five_year_fixed_pct: 6.01,
  },
  bridging: {
    as_at: "Q3 2026",
    source: "Bridging Trends",
    average_monthly_rate_pct: 0.77,
    average_ltv_pct: 59,
    average_completion_days: 41,
    regulated_share_pct: 45,
  },
  pages: {
    mortgage_rates_today: "https://www.foxdavidson.co.uk/mortgages/mortgage-rates-today/",
    bank_rate: "https://www.foxdavidson.co.uk/bank-of-england-base-rate/",
    buy_to_let_rates: "https://www.foxdavidson.co.uk/finance-guide/buy-to-let-mortgage-rates/",
    bridging_rates: "https://www.foxdavidson.co.uk/finance-guide/bridging-loan-rates/",
  },
  note:
    "Market averages, not offers. Individual rates depend on the lender, loan size, LTV and the borrower's " +
    "circumstances. Rates and lending criteria are subject to change by lenders without notice.",
};
