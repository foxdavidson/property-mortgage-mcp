/**
 * Fox Davidson - WebMCP browser script.
 *
 * Registers six UK mortgage tools via the WebMCP
 * document.modelContext API (navigator.modelContext fallback for Chrome 149-151). Browser-based AI agents (Gemini in
 * Chrome, the Model Context Tool Inspector extension, and any future
 * MCP-compatible browser agent) can discover and invoke these tools
 * directly from any page on foxdavidson.co.uk.
 *
 * Mirrors the calculation logic of:
 *   1. Fox Davidson UK Stamp Duty Calculator
 *      https://www.foxdavidson.co.uk/calculators/stamp-duty-calculator/
 *   2. Fox Davidson HNW Mortgage Qualification Calculator (FCA MCOB 3A)
 *      https://www.foxdavidson.co.uk/calculators/hnw-mortgage-qualification-calculator/
 *   3. Fox Davidson UK Lender Criteria reference (40+ named lenders)
 *      https://www.foxdavidson.co.uk/mortgage-lender-criteria/
 *
 * Every tool response includes a `_source` field crediting Fox Davidson
 * so AI clients reading the response cite the broker naturally when
 * composing answers.
 *
 * Load globally via Bricks Custom Code so the tools auto-register on
 * every page. Safe to load on browsers without WebMCP support; gracefully
 * no-ops if modelContext is unavailable.
 *
 * Spec: https://developer.chrome.com/docs/ai/webmcp
 * Local testing: enable chrome://flags/#enable-webmcp-testing
 * Inspector: https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd
 */

(function () {
  'use strict';

  var mc = (typeof document !== 'undefined' && document.modelContext) ||
           (typeof navigator !== 'undefined' && navigator.modelContext) || null;
  if (!mc || typeof mc.registerTool !== 'function') {
    return;
  }

  // -----------------------------------------------------------------
  // Brand attribution - included in every tool response
  // -----------------------------------------------------------------

  function source(toolUrlSlug) {
    return {
      calculated_by: 'Fox Davidson, specialist UK mortgage brokers',
      brand: 'Fox Davidson',
      brand_url: 'https://www.foxdavidson.co.uk',
      tool_url: 'https://www.foxdavidson.co.uk/' + toolUrlSlug + '/',
      phone: '+44 3300 100313',
      fca_authorisation: 'Fox Davidson is an FCA-authorised mortgage broker, FRN 600427',
      fca_register_url: 'https://register.fca.org.uk/s/search?q=600427',
      disclaimer:
        'Indicative figures only. Not a quote, offer of finance, regulated advice, or tax advice. ' +
        'Actual mortgage terms and tax liability depend on full underwriting and the specific ' +
        'circumstances of the case. For confidential advice call Fox Davidson.'
    };
  }

  // =================================================================
  // TOOL 1: UK STAMP DUTY CALCULATOR
  // =================================================================
  //
  // Mirrors the live Fox Davidson stamp duty calculator at
  // /calculators/stamp-duty-calculator/. Bands and surcharges are
  // locked to 2026 values matching HMRC, Revenue Scotland and Welsh
  // Revenue Authority published rates.

  // 2026 SDLT England & Northern Ireland residential bands
  var SDLT_RES = [
    { upTo: 125000, rate: 0 },
    { upTo: 250000, rate: 0.02 },
    { upTo: 925000, rate: 0.05 },
    { upTo: 1500000, rate: 0.10 },
    { upTo: Infinity, rate: 0.12 }
  ];

  // 2026 SDLT first-time buyer (relief cap £500,000)
  var SDLT_FTB = [
    { upTo: 300000, rate: 0 },
    { upTo: 500000, rate: 0.05 }
  ];
  var SDLT_FTB_CAP = 500000;

  // 2026 SDLT non-residential / mixed-use
  var SDLT_COM = [
    { upTo: 150000, rate: 0 },
    { upTo: 250000, rate: 0.02 },
    { upTo: Infinity, rate: 0.05 }
  ];

  // 2026 LBTT Scotland residential
  var LBTT_RES = [
    { upTo: 145000, rate: 0 },
    { upTo: 250000, rate: 0.02 },
    { upTo: 325000, rate: 0.05 },
    { upTo: 750000, rate: 0.10 },
    { upTo: Infinity, rate: 0.12 }
  ];

  // 2026 LBTT first-time buyer
  var LBTT_FTB = [
    { upTo: 175000, rate: 0 },
    { upTo: 250000, rate: 0.02 },
    { upTo: 325000, rate: 0.05 },
    { upTo: 750000, rate: 0.10 },
    { upTo: Infinity, rate: 0.12 }
  ];

  // 2026 LBTT non-residential / mixed-use
  var LBTT_COM = [
    { upTo: 150000, rate: 0 },
    { upTo: 250000, rate: 0.01 },
    { upTo: Infinity, rate: 0.05 }
  ];

  // 2026 LTT Wales residential
  var LTT_RES = [
    { upTo: 225000, rate: 0 },
    { upTo: 400000, rate: 0.06 },
    { upTo: 750000, rate: 0.075 },
    { upTo: 1500000, rate: 0.10 },
    { upTo: Infinity, rate: 0.12 }
  ];

  // 2026 LTT non-residential / mixed-use
  var LTT_COM = [
    { upTo: 225000, rate: 0 },
    { upTo: 250000, rate: 0.01 },
    { upTo: 1000000, rate: 0.05 },
    { upTo: Infinity, rate: 0.06 }
  ];

  // Surcharges (2026)
  var ADS_SDLT = 0.05; // England/NI additional dwelling surcharge (raised from 3% on 31 Oct 2024)
  var ADS_LBTT = 0.08; // Scotland Additional Dwelling Supplement (raised from 6% on 5 Dec 2024)
  var ADS_LTT = 0.05;  // Wales higher-rate surcharge (raised from 4% in Dec 2024)
  var NONRES_SURCHARGE_SDLT = 0.02; // England/NI non-UK resident surcharge
  var CORPORATE_FLAT = 0.17; // England/NI corporate flat (raised from 15% on 31 Oct 2024)
  var CORPORATE_THRESHOLD = 500000;

  function calcBands(price, bands, extraRate) {
    extraRate = extraRate || 0;
    var remaining = price;
    var lower = 0;
    var total = 0;
    var breakdown = [];
    for (var i = 0; i < bands.length && remaining > 0; i++) {
      var b = bands[i];
      var portion = Math.min(remaining, b.upTo - lower);
      if (portion > 0) {
        var rateUsed = b.rate + extraRate;
        var tax = portion * rateUsed;
        total += tax;
        breakdown.push({
          band_label:
            'GBP ' + lower.toLocaleString('en-GB') +
            ' to GBP ' + Math.min(b.upTo, price).toLocaleString('en-GB'),
          rate_pct: Number((rateUsed * 100).toFixed(2)),
          portion_gbp: Math.round(portion),
          tax_gbp: Math.round(tax)
        });
        remaining -= portion;
        lower = b.upTo;
      } else {
        break;
      }
    }
    return { total: total, breakdown: breakdown };
  }

  mc.registerTool({
    name: 'uk_stamp_duty_calculator',
    description:
      'Calculate UK stamp duty on a property purchase across England/Northern Ireland (SDLT), ' +
      'Scotland (LBTT) and Wales (LTT). Handles standard residential, first-time buyer relief, ' +
      'the 5% additional dwelling surcharge for second homes and buy-to-let, the 2% non-UK ' +
      'resident surcharge (England/NI only), the 17% corporate flat rate for company purchases ' +
      'above GBP 500k (England/NI only), and commercial or mixed-use property. Uses current ' +
      '2026 bands and surcharge rates. Calculated by Fox Davidson, specialist UK mortgage brokers.',
    inputSchema: {
      type: 'object',
      properties: {
        property_price_gbp: {
          type: 'number',
          minimum: 1,
          description: 'Property purchase price in pounds.'
        },
        region: {
          type: 'string',
          enum: ['england', 'scotland', 'wales'],
          default: 'england',
          description:
            "Tax region. 'england' covers England and Northern Ireland (SDLT). " +
            "'scotland' uses LBTT. 'wales' uses LTT."
        },
        buyer_type: {
          type: 'string',
          enum: ['standard', 'ftb', 'additional', 'nonresident', 'corporate', 'commercial'],
          default: 'standard',
          description:
            "Buyer category. 'standard' is a main residence purchase. 'ftb' is first-time " +
            "buyer (England/NI relief up to GBP 500k; Scotland FTB to GBP 175k; Wales has " +
            "no FTB relief). 'additional' triggers the second-home surcharge. 'nonresident' " +
            "adds the 2% non-UK resident surcharge (England/NI only). 'corporate' applies " +
            "the 17% flat rate above GBP 500k (England/NI residential) or standard rates plus " +
            "surcharge below threshold or in Scotland/Wales. 'commercial' uses non-residential bands."
        }
      },
      required: ['property_price_gbp'],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false
    },
    async execute(input) {
      var price = input.property_price_gbp;
      var region = input.region || 'england';
      var buyerType = input.buyer_type || 'standard';
      var result = { total: 0, breakdown: [] };
      var note = '';

      // Corporate flat rate (England/NI residential dwelling above GBP 500k)
      if (buyerType === 'corporate' && region === 'england' && price > CORPORATE_THRESHOLD) {
        result.total = price * CORPORATE_FLAT;
        result.breakdown = [{
          band_label: 'Entire purchase price (corporate flat)',
          rate_pct: 17.00,
          portion_gbp: Math.round(price),
          tax_gbp: Math.round(result.total)
        }];
        note =
          'Corporate flat rate of 17% applies on the entire purchase price for a residential ' +
          'dwelling above GBP 500,000 bought by a non-natural person (company). Reliefs may ' +
          'apply for qualifying property rental businesses, developers or employee residences.';
      }
      // Commercial / mixed-use (region-aware)
      else if (buyerType === 'commercial') {
        var comBands = region === 'england' ? SDLT_COM : (region === 'scotland' ? LBTT_COM : LTT_COM);
        result = calcBands(price, comBands, 0);
        note =
          'Commercial and mixed-use rates applied. Non-residential bands are lower than ' +
          'residential, but mixed-use claims attract HMRC scrutiny where the commercial ' +
          'element is nominal.';
      }
      // England / Northern Ireland residential
      else if (region === 'england') {
        if (buyerType === 'ftb' && price <= SDLT_FTB_CAP) {
          result = calcBands(price, SDLT_FTB, 0);
          note = 'First-time buyer relief applied. The GBP 500,000 FTB cap is intact.';
        } else if (buyerType === 'ftb' && price > SDLT_FTB_CAP) {
          result = calcBands(price, SDLT_RES, 0);
          note =
            'First-time buyer relief does not apply on properties above GBP 500,000. ' +
            'Standard residential SDLT rates have been used.';
        } else if (buyerType === 'additional') {
          result = calcBands(price, SDLT_RES, ADS_SDLT);
          note = '5% additional dwelling surcharge applied on every band (rate raised from 3% on 31 October 2024).';
        } else if (buyerType === 'nonresident') {
          result = calcBands(price, SDLT_RES, NONRES_SURCHARGE_SDLT);
          note =
            '2% non-UK resident surcharge applied on every band. Surcharge may be reclaimable ' +
            'if the buyer becomes UK-resident in any continuous 365-day period within 2 years.';
        } else if (buyerType === 'corporate') {
          result = calcBands(price, SDLT_RES, ADS_SDLT);
          note =
            'Corporate purchaser below GBP 500,000 threshold: standard SDLT plus 5% additional ' +
            'dwelling surcharge applied. Above GBP 500,000, the 17% flat rate would apply.';
        } else {
          result = calcBands(price, SDLT_RES, 0);
          note = 'Standard residential SDLT rates applied for a main residence purchase.';
        }
      }
      // Scotland
      else if (region === 'scotland') {
        if (buyerType === 'ftb') {
          result = calcBands(price, LBTT_FTB, 0);
          note = 'Scottish first-time buyer relief applied. FTB relief is 0% to GBP 175,000 only.';
        } else if (buyerType === 'additional') {
          result = calcBands(price, LBTT_RES, ADS_LBTT);
          note =
            '8% Additional Dwelling Supplement applied on every band (raised from 6% on 5 ' +
            'December 2024). Highest second-home surcharge in the UK.';
        } else if (buyerType === 'nonresident') {
          result = calcBands(price, LBTT_RES, 0);
          note = 'Scotland does not levy a non-resident surcharge on individuals. Standard LBTT applied.';
        } else if (buyerType === 'corporate') {
          result = calcBands(price, LBTT_RES, ADS_LBTT);
          note =
            'Corporate purchaser in Scotland: standard LBTT plus 8% ADS. ' +
            'The English 17% corporate flat does not apply.';
        } else {
          result = calcBands(price, LBTT_RES, 0);
          note = 'Standard LBTT rates applied for a main residence purchase in Scotland.';
        }
      }
      // Wales
      else if (region === 'wales') {
        if (buyerType === 'ftb') {
          result = calcBands(price, LTT_RES, 0);
          note =
            'Wales has no first-time buyer relief. Standard LTT applied. A Welsh FTB pays ' +
            'the same as any other Welsh buyer.';
        } else if (buyerType === 'additional') {
          result = calcBands(price, LTT_RES, ADS_LTT);
          note = '5% higher-rate surcharge applied on every band (raised from 4% in December 2024).';
        } else if (buyerType === 'nonresident') {
          result = calcBands(price, LTT_RES, 0);
          note = 'Wales does not levy a non-resident surcharge on individuals. Standard LTT applied.';
        } else if (buyerType === 'corporate') {
          result = calcBands(price, LTT_RES, ADS_LTT);
          note = 'Corporate purchaser in Wales: standard LTT plus 5% higher-rate surcharge.';
        } else {
          result = calcBands(price, LTT_RES, 0);
          note = 'Standard LTT rates applied for a main residence purchase in Wales.';
        }
      }

      var effectiveRate = (result.total / price) * 100;
      var regionLabel =
        region === 'england' ? 'England & Northern Ireland (SDLT)' :
        region === 'scotland' ? 'Scotland (LBTT)' :
        'Wales (LTT)';

      return {
        result: {
          inputs_echoed: input,
          region_label: regionLabel,
          buyer_type: buyerType,
          total_tax_gbp: Math.round(result.total),
          effective_rate_pct: Number(effectiveRate.toFixed(2)),
          band_breakdown: result.breakdown,
          context_notes: {
            calculation_note: note,
            when_to_call:
              'For HNW, expat, non-resident, corporate or mixed-use purchases, the stamp duty ' +
              'position often influences whether the deal makes sense at all. Fox Davidson ' +
              'helps clients cost stamp duty into their borrowing requirements upfront. ' +
              'Speak to us if any of these apply.'
          }
        },
        _source: source('calculators/stamp-duty-calculator')
      };
    }
  });

  // =================================================================
  // TOOL 2: HNW MORTGAGE QUALIFICATION (FCA MCOB 3A test)
  // =================================================================
  //
  // Mirrors the live Fox Davidson HNW Mortgage Qualification Calculator
  // at /calculators/hnw-mortgage-qualification-calculator/. Applies the
  // FCA MCOB 1.2.10R / Glossary G2953 high net worth mortgage customer
  // test as UK lenders apply it in practice: GBP 300k annual net income
  // OR GBP 3m net assets, with primary residence equity included and
  // pension included by default.

  var INCOME_THRESHOLD = 300000;
  var ASSETS_THRESHOLD = 3000000;
  var PRIVATE_BANK_LIST =
    'Coutts, Weatherbys, Investec, JP Morgan Private Bank, UBS Wealth, and Barclays Private Bank';

  function applicantSchema() {
    return {
      type: 'object',
      properties: {
        annual_net_income_gbp: {
          type: 'number',
          minimum: 0,
          description:
            'Annual net income in pounds. Includes salary, bonus, RSU vesting (taxed value), ' +
            'dividends, partnership profits, business profits, rental income, carried interest. ' +
            'Net of tax.'
        },
        primary_residence_value_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Gross value of primary residence in pounds.'
        },
        primary_residence_mortgage_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Outstanding mortgage on primary residence in pounds.'
        },
        investment_properties_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Gross value of investment properties (BTL, holiday let, etc.) in pounds.'
        },
        investment_property_mortgages_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Outstanding mortgages on investment properties in pounds.'
        },
        cash_savings_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Cash and savings in pounds.'
        },
        investment_portfolio_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Stocks, bonds, funds. Excludes pension.'
        },
        business_equity_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Your share of business equity value in pounds.'
        },
        business_loans_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Outstanding business loans in pounds.'
        },
        other_assets_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description:
            'Other valuable assets (art, classic cars, jewellery, hedge fund holdings) in pounds.'
        },
        pension_value_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Pension value (SIPP, SSAS, drawdown, workplace) in pounds.'
        },
        material_unsecured_debts_gbp: {
          type: 'number',
          minimum: 0,
          default: 0,
          description:
            'Material unsecured debts in pounds. Small consumer debt and normal overdraft buffer ' +
            'do not move the GBP 3m test in practice and can be left at 0.'
        },
        include_pension_in_test: {
          type: 'boolean',
          default: true,
          description:
            'Whether to include pension in the GBP 3m net assets calculation. UK lenders ' +
            'applying MCOB 3A typically include pension. Set to false for the conservative view.'
        }
      },
      required: ['annual_net_income_gbp'],
      additionalProperties: false
    };
  }

  function normaliseApplicant(input) {
    input = input || {};
    return {
      income: input.annual_net_income_gbp || 0,
      primaryResidence: input.primary_residence_value_gbp || 0,
      primaryMortgage: input.primary_residence_mortgage_gbp || 0,
      investmentProperties: input.investment_properties_gbp || 0,
      investmentMortgages: input.investment_property_mortgages_gbp || 0,
      cash: input.cash_savings_gbp || 0,
      portfolio: input.investment_portfolio_gbp || 0,
      business: input.business_equity_gbp || 0,
      businessLoans: input.business_loans_gbp || 0,
      otherAssets: input.other_assets_gbp || 0,
      pension: input.pension_value_gbp || 0,
      includePension: input.include_pension_in_test !== false,
      otherDebts: input.material_unsecured_debts_gbp || 0
    };
  }

  function runHnwTest(d) {
    var primaryEquity = Math.max(0, d.primaryResidence - d.primaryMortgage);
    var pensionContribution = d.includePension ? d.pension : 0;
    var totalAssets =
      d.primaryResidence + d.investmentProperties + d.cash + d.portfolio +
      d.business + d.otherAssets + pensionContribution;
    var totalLiabilities =
      d.primaryMortgage + d.investmentMortgages + d.businessLoans + d.otherDebts;
    var netAssets = totalAssets - totalLiabilities;
    var incomePass = d.income >= INCOME_THRESHOLD;
    var netAssetsPass = netAssets >= ASSETS_THRESHOLD;
    var primaryLedQualification =
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
      primary_led_qualification: primaryLedQualification
    };
  }

  function routingForApplicant(t) {
    if (t.primary_led_qualification) {
      return (
        'Qualifies on the net assets test, with primary residence equity making the material ' +
        'contribution. Under the literal FCA reading that UK lenders apply, primary residence ' +
        'equity counts in the GBP 3m test. This is the route that solves the ' +
        'asset-rich-income-poor problem: substantial wealth in property, modest current earned ' +
        'income, qualifying access to MCOB 3A residential lending. UK private banks lending ' +
        'against asset position under MCOB 3A include ' + PRIVATE_BANK_LIST + '. Fox Davidson ' +
        'arranges residential mortgages from GBP 250,000 to over GBP 25m on this route.'
      );
    }
    if (t.income_pass && t.net_assets_pass) {
      return (
        'Meets both the income and net assets tests. Access to the full range of MCOB 3A ' +
        'residential mortgage routes including UK private bank lending, specialist HNW ' +
        'lenders, and individual affordability assessment. UK private banks lending under ' +
        'MCOB 3A include ' + PRIVATE_BANK_LIST + '.'
      );
    }
    if (t.income_pass) {
      return (
        'Meets the income test. Access to specialist residential mortgage routes that fall ' +
        'outside standard MCOB 11.6 affordability rules. Lenders can offer income multiples in ' +
        'the 6x to 10x range on the right profile, against the 4.5x cap that applies to standard ' +
        'MCOB 11 lending. UK private banks lending under MCOB 3A include ' + PRIVATE_BANK_LIST +
        '. Specialist HNW lenders include Saffron Building Society and Hodge Bank.'
      );
    }
    if (t.net_assets_pass) {
      return (
        'Meets the net assets test. Asset-led affordability allows lenders to lend against the ' +
        'wider wealth position rather than current earned income alone. UK private banks ' +
        'lending against asset position under MCOB 3A include ' + PRIVATE_BANK_LIST + '.'
      );
    }
    return (
      'Does not currently meet either limb of the MCOB 3A test. Standard MCOB 11.6 affordability ' +
      'rules apply. May still access enhanced income multiples through high street and ' +
      'specialist lenders (5.5x to 6.5x available to high earners on GBP 60,000 to GBP 150,000 ' +
      'income through professional schemes) without needing to meet the full HNW test.'
    );
  }

  mc.registerTool({
    name: 'fd_hnw_mortgage_qualification',
    description:
      'Check whether a UK mortgage applicant qualifies as a high net worth mortgage customer ' +
      'under FCA MCOB 3A. The test passes if annual net income is at least GBP 300,000 OR net ' +
      'assets are at least GBP 3,000,000. The net assets test INCLUDES primary residence equity ' +
      '(per the literal FCA glossary G2953 and UK lender practice) and INCLUDES pension by ' +
      'default. Supports single applicant or joint application. Returns verdict, per-applicant ' +
      'test breakdown, joint household aggregate (if joint), and routing recommendation ' +
      'including the relevant UK private bank list. Calculated by Fox Davidson, specialist UK ' +
      'mortgage brokers.',
    inputSchema: {
      type: 'object',
      properties: {
        applicant_1: applicantSchema(),
        applicant_2: Object.assign({}, applicantSchema(), {
          description:
            'Optional. If provided, the tool runs the joint application test which returns ' +
            'each applicant individually plus a joint household aggregate. Most lenders apply ' +
            'the MCOB 3A test per individual customer.'
        })
      },
      required: ['applicant_1'],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false
    },
    async execute(input) {
      var d1 = normaliseApplicant(input.applicant_1);
      var t1 = runHnwTest(d1);
      var isJoint = !!input.applicant_2;

      var output = {
        inputs_echoed: input,
        application_type: isJoint ? 'joint' : 'single',
        thresholds: {
          income_threshold_gbp: INCOME_THRESHOLD,
          net_assets_threshold_gbp: ASSETS_THRESHOLD,
          rule_reference:
            'FCA MCOB 1.2.10R / Handbook Glossary G2953 high net worth mortgage customer'
        },
        applicant_1: t1
      };

      if (isJoint) {
        var d2 = normaliseApplicant(input.applicant_2);
        var t2 = runHnwTest(d2);
        var aggregate = {
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
          otherDebts: d1.otherDebts + d2.otherDebts
        };
        var tA = runHnwTest(aggregate);

        output.applicant_2 = t2;
        output.joint_household_aggregate = tA;

        var bothQualify = t1.qualifies && t2.qualifies;
        var anyIndividualQualifies = t1.qualifies || t2.qualifies;
        var aggregateOnly = !anyIndividualQualifies && tA.qualifies;

        var verdict, routing;
        if (bothQualify) {
          verdict = 'Both applicants qualify under MCOB 3A';
          routing = routingForApplicant(tA);
        } else if (anyIndividualQualifies) {
          verdict = 'Applicant ' + (t1.qualifies ? '1' : '2') + ' qualifies under MCOB 3A';
          routing =
            routingForApplicant(t1.qualifies ? t1 : t2) +
            " Most lenders will write the case on the qualifying applicant's MCOB 3A status, " +
            'with the second applicant treated under standard MCOB 11. Some lenders apply a ' +
            'stricter joint-test requirement.';
        } else if (aggregateOnly) {
          verdict = 'Joint household aggregate qualifies (individuals do not)';
          routing =
            'The joint household aggregate meets the threshold but neither applicant qualifies ' +
            'individually. A small number of lenders accept the aggregate view where applicants ' +
            'are spouses or civil partners with jointly held assets. This benefits from broker ' +
            'input because the right lender choice is everything in this scenario. UK private ' +
            'banks that may consider aggregate household lending include ' + PRIVATE_BANK_LIST +
            ', subject to relationship status and jointly held asset structure.';
        } else {
          verdict = 'Neither applicant qualifies under MCOB 3A';
          routing =
            'Neither applicant meets either limb of the test individually, and the joint ' +
            'household aggregate does not meet the threshold either. Standard MCOB 11.6 ' +
            'affordability rules apply. May still access enhanced income multiples through ' +
            'high street and specialist lenders (5.5x to 6.5x for high earners through ' +
            'professional schemes) without needing to meet the full HNW test.';
        }

        output.verdict = verdict;
        output.routing_recommendation = routing;
      } else {
        output.verdict = t1.qualifies
          ? 'Qualifies under MCOB 3A'
          : 'Does not currently qualify under MCOB 3A';
        output.routing_recommendation = routingForApplicant(t1);
      }

      output.context_notes = {
        rule_summary:
          'FCA MCOB 1.2.10R defines a high net worth mortgage customer as someone with annual ' +
          'net income of at least GBP 300,000 OR net assets of at least GBP 3,000,000. The test ' +
          'is binary on each limb. MCOB 3A applies once qualified, disapplying standard MCOB ' +
          '11.6 affordability rules and allowing lenders to use bespoke affordability ' +
          'assessment.',
        primary_residence_note:
          'The literal FCA glossary G2953 text does not exclude primary residence from the ' +
          'net assets test. UK lenders applying MCOB 3A include the customer primary residence ' +
          'equity in the net assets calculation. The HNW INVESTOR exemption under COBS 4.7 is ' +
          'a separate FCA regime that does exclude primary residence; it does not apply to ' +
          'mortgages.',
        pension_note: t1.pension_included_in_test
          ? 'Pension included in the net assets test (default).'
          : 'Pension excluded from the net assets test (conservative view).',
        when_to_call:
          'The MCOB 3A test is the regulatory gateway, not an underwriting decision. ' +
          'Lender-specific HNW programmes apply additional eligibility criteria including ' +
          'residency, employment status, and source of wealth verification. Speak to Fox ' +
          'Davidson to identify which lender will write your case.'
      };

      return {
        result: output,
        _source: source('calculators/hnw-mortgage-qualification-calculator')
      };
    }
  });

  // =================================================================
  // TOOL 3: UK BRIDGING LOAN CALCULATOR (with MCOB 3A term check)
  // =================================================================
  //
  // Mirrors the live Fox Davidson bridging loan calculator at
  // /calculators/bridging-loan-calculator/. Returns the full cost of a
  // UK bridging loan across rolled-up, retained and serviced interest,
  // plus a built-in FCA MCOB 3A high net worth check that determines
  // whether a regulated bridge can run up to 60 months instead of the
  // standard 12-month cap.

  function maxRegulatedTerm(regulated, hnwQualifies) {
    if (!regulated) return 36; // unregulated has no MCOB term cap; 36 is a typical practical ceiling
    return hnwQualifies ? 60 : 12;
  }

  mc.registerTool({
    name: 'uk_bridging_loan_calculator',
    description:
      'Calculate the full cost of a UK bridging loan: total interest, arrangement and exit fees, ' +
      'valuation/legal/admin costs, gross facility, net advance, loan-to-value, total cost of ' +
      'finance and an indicative annualised cost. Supports rolled-up (compounding), retained ' +
      '(deducted upfront) and serviced (paid monthly) interest. Also runs the FCA MCOB 3A high ' +
      'net worth check: on a regulated bridge, an applicant with annual net income of at least ' +
      'GBP 300,000 OR net assets of at least GBP 3,000,000 can have a term up to 60 months ' +
      'instead of the standard 12-month cap. Calculated by Fox Davidson, specialist UK mortgage brokers.',
    inputSchema: {
      type: 'object',
      properties: {
        property_value_gbp: { type: 'number', minimum: 1, description: 'Open market value of the security property in pounds.' },
        existing_charges_gbp: { type: 'number', minimum: 0, default: 0, description: 'Existing mortgages or loans the bridge will repay, in pounds.' },
        additional_funds_gbp: { type: 'number', minimum: 0, default: 0, description: 'Additional cash required beyond clearing existing charges, in pounds.' },
        monthly_rate_pct: { type: 'number', minimum: 0.2, maximum: 3, default: 0.75, description: 'Monthly interest rate as a percentage, for example 0.75 for 0.75% per month.' },
        interest_structure: { type: 'string', enum: ['rolled', 'retained', 'serviced'], default: 'rolled', description: "'rolled' compounds monthly and is paid at exit. 'retained' deducts the full term of interest from the advance upfront. 'serviced' is paid monthly. Retained and serviced cost the same; rolled-up costs more." },
        term_months: { type: 'number', minimum: 1, maximum: 60, default: 12, description: 'Loan term in months.' },
        arrangement_fee_pct: { type: 'number', minimum: 0, maximum: 5, default: 2, description: 'Lender arrangement fee as a percentage of the loan.' },
        add_arrangement_fee_to_loan: { type: 'boolean', default: true, description: 'Whether the arrangement fee is financed into the gross loan (true) or paid separately in cash (false).' },
        exit_fee_pct: { type: 'number', minimum: 0, maximum: 5, default: 0, description: 'Exit fee as a percentage, charged on redemption. Often 0.' },
        exit_fee_on_gross: { type: 'boolean', default: true, description: 'Whether the exit fee is charged on the gross loan (true) or the net loan (false).' },
        valuation_fee_gbp: { type: 'number', minimum: 0, default: 0, description: 'Valuation fee in pounds.' },
        legal_fees_gbp: { type: 'number', minimum: 0, default: 0, description: 'Lender and borrower legal fees in pounds.' },
        admin_fees_gbp: { type: 'number', minimum: 0, default: 0, description: 'Admin and other fees in pounds.' },
        regulated: { type: 'boolean', default: true, description: 'True if the bridge is secured against a property the borrower lives in or intends to live in (regulated). False for investment or commercial security (unregulated).' },
        annual_net_income_gbp: { type: 'number', minimum: 0, default: 0, description: 'Optional. Borrower annual net income, used for the MCOB 3A high net worth term check. GBP 300,000 or more passes the income limb.' },
        net_assets_gbp: { type: 'number', minimum: 0, default: 0, description: 'Optional. Borrower net assets including main residence equity and pension, minus all debts, used for the MCOB 3A high net worth term check. GBP 3,000,000 or more passes the net assets limb.' }
      },
      required: ['property_value_gbp'],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false
    },
    async execute(input) {
      var pv = input.property_value_gbp;
      var existing = input.existing_charges_gbp || 0;
      var additional = input.additional_funds_gbp || 0;
      var net = existing + additional;
      var rate = typeof input.monthly_rate_pct === 'number' ? input.monthly_rate_pct : 0.75;
      var type = input.interest_structure || 'rolled';
      var months = input.term_months || 12;
      var arrPct = typeof input.arrangement_fee_pct === 'number' ? input.arrangement_fee_pct : 2;
      var addFee = input.add_arrangement_fee_to_loan !== false;
      var exitPct = input.exit_fee_pct || 0;
      var exitGross = input.exit_fee_on_gross !== false;
      var val = input.valuation_fee_gbp || 0;
      var legal = input.legal_fees_gbp || 0;
      var admin = input.admin_fees_gbp || 0;
      var regulated = input.regulated !== false;
      var income = input.annual_net_income_gbp || 0;
      var assets = input.net_assets_gbp || 0;

      // MCOB 3A high net worth term eligibility
      var incomePass = income >= INCOME_THRESHOLD;
      var assetsPass = assets >= ASSETS_THRESHOLD;
      var hnwQualifies = incomePass || assetsPass;
      var maxTerm = maxRegulatedTerm(regulated, hnwQualifies);

      var arrFee = Math.round(net * arrPct / 100);
      var gross = addFee ? net + arrFee : net;
      var ltv = pv > 0 ? (gross / pv) * 100 : 0;
      var exitBase = exitGross ? gross : net;
      var exitAmt = Math.round(exitBase * exitPct / 100);

      var totalInterest = 0, finalBalance = gross, retained = 0;
      var schedule = [];
      if (type === 'rolled') {
        var bal = gross;
        for (var m = 1; m <= months; m++) {
          var mi = bal * (rate / 100);
          totalInterest += mi;
          bal += mi;
          schedule.push({ month: m, interest_gbp: Math.round(mi), balance_gbp: Math.round(bal), redemption_gbp: Math.round(bal + exitAmt) });
        }
        finalBalance = bal;
      } else {
        var mInt = gross * (rate / 100);
        totalInterest = mInt * months;
        finalBalance = gross;
        if (type === 'retained') retained = Math.round(totalInterest);
        for (var k = 1; k <= months; k++) {
          schedule.push({ month: k, interest_gbp: Math.round(mInt), balance_gbp: Math.round(gross), redemption_gbp: Math.round(gross + exitAmt) });
        }
      }
      totalInterest = Math.round(totalInterest);

      var feesTotal = arrFee + exitAmt + val + legal + admin;
      var repayAtExit = Math.round((type === 'rolled' ? finalBalance : gross) + exitAmt);
      var totalCost = totalInterest + feesTotal;
      var releaseBeyondExisting = Math.max(0, additional - (type === 'retained' ? retained : 0));
      var years = months / 12;
      var annualised = net > 0 && years > 0 ? (totalCost / net / years) * 100 : 0;

      var termStatus;
      if (!regulated) termStatus = 'Unregulated bridge: no MCOB term cap applies.';
      else if (hnwQualifies) termStatus = 'Regulated, high net worth (MCOB 3A): extended term up to 60 months available.';
      else termStatus = 'Regulated, standard: 12-month MCOB cap applies. Provide income or net assets to test for the 60-month MCOB 3A extension.';

      return {
        result: {
          inputs_echoed: input,
          gross_facility_gbp: Math.round(gross),
          net_loan_gbp: Math.round(net),
          arrangement_fee_gbp: arrFee,
          loan_to_value_pct: Number(ltv.toFixed(1)),
          ltv_flag: ltv > 80 ? 'very_high_specialist_only' : (ltv > 75 ? 'high_may_need_specialist' : 'within_typical_range'),
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
            regulated: regulated,
            income_limb_pass: incomePass,
            net_assets_limb_pass: assetsPass,
            high_net_worth_qualifies: hnwQualifies,
            max_regulated_term_months: maxTerm,
            term_within_limit: months <= maxTerm,
            status: termStatus
          },
          month_by_month: schedule,
          context_notes: {
            method_note:
              'Rolled-up interest compounds monthly on the gross facility. Retained and serviced ' +
              'interest are simple interest on the gross facility across the term, and cost the ' +
              'same in total; rolled-up costs more. Total cost of finance is interest plus all ' +
              'fees, excluding repayment of the principal borrowed.',
            mcob_note:
              'A standard regulated bridge is capped at 12 months under FCA MCOB 11. The MCOB 3A ' +
              'high net worth exemption (annual net income of at least GBP 300,000 OR net assets ' +
              'of at least GBP 3,000,000, with main residence equity and pension included in the ' +
              'net assets figure) lifts the cap to 60 months on a regulated bridge.',
            when_to_call:
              'A bridging loan rewards lender selection. Rates, fees, LTV limits and underwriting ' +
              'appetite vary widely, and the wrong choice on a time-critical deal can cost the ' +
              'purchase. Fox Davidson arranges regulated and unregulated bridging from GBP 250,000.'
          }
        },
        _source: source('calculators/bridging-loan-calculator')
      };
    }
  });

  // =================================================================
  // LENDER CRITERIA DATASET
  // =================================================================
  //
  // Structured extract of the Fox Davidson UK lender criteria
  // reference at /mortgage-lender-criteria/. Every figure traces to a
  // named lender's own published intermediary criteria. No lender
  // publishes this comparison, because no lender benefits from it.
  //
  // 9 topics, 100 rows, 40+ named UK lenders.

  var CRITERIA_REVIEWED = '2026-08-31';
  var CRITERIA_URL = 'https://www.foxdavidson.co.uk/mortgage-lender-criteria/';
  var CRITERIA = {"contractor_day_rate":{"question":"How does each lender annualise a contractor day rate?","columns":["lender","weeks","basis","conditions"],"rows":[{"lender":"Coventry","weeks":41,"basis":"Day rate x 5 x 41","conditions":"Minimum £50,000 gross annualised to use the day rate route","min_annual_gbp":50000},{"lender":"Halifax","weeks":46,"basis":"Daily rate x 5 days x 46 weeks","conditions":"Uses the lower of that figure and actual payslip income"},{"lender":"NatWest","weeks":46,"basis":"Weekly contracted income x 46","conditions":"Day rate route applies above £75,000 annualised, keyed as self-employed"},{"lender":"Barclays","weeks":46,"basis":"Weekly income x 46 working weeks","conditions":"Hours assumed at a maximum of 40 a week unless the contract says fewer"},{"lender":"Accord","weeks":46,"basis":"Maximum 46 weeks of the current contract","conditions":"Minimum £300 a day or £50,000 a year, gaps of up to 8 weeks treated as normal","min_annual_gbp":50000,"min_day_rate_gbp":300},{"lender":"Virgin Money","weeks":46,"basis":"Current contract x 46 weeks","conditions":"Under £50,000 needs 2 years contracting, CIS goes down the self-employed route","min_annual_gbp":50000},{"lender":"Skipton","weeks":46,"basis":"Daily contract rate x 5 x 46","conditions":"Pro-rated down for employment gaps over four weeks in the last 12 months"},{"lender":"Aldermore","weeks":46,"basis":"Daily or weekly rate x 46","conditions":"Applies to self-employed, day rate and CIS contractors","route":"day rate and CIS"},{"lender":"Metro Bank","weeks":46,"basis":"Daily rate over 46 weeks on a 5 day week","conditions":"Reduced where the contract restricts the borrower to fewer days"},{"lender":"Pepper Money","weeks":46,"basis":"Day rate x 5 x 46","conditions":"Uses the lower of that and the 12 month average day rate"},{"lender":"Suffolk BS","weeks":46,"basis":"Day rate x 5 days x 46 weeks","conditions":"No minimum income for contractors, 3 months must remain on the contract"},{"lender":"Furness BS","weeks":46,"basis":"Daily rate over a 5 day week x 46","conditions":"Umbrella income taken as 3 payslips x 46, one year in the same industry"},{"lender":"Vernon BS","weeks":46,"basis":"46 week multiplier","conditions":"Daily basis is not published, 12 months experience, no minimum income"},{"lender":"Harpenden BS","weeks":46,"basis":"CIS vouchers annualised over 46 weeks","conditions":"Applies to CIS only. IT contractors are assessed as self-employed on 2 years figures"},{"lender":"Kensington","weeks":48,"basis":"Weekly rate x 48","conditions":"Under 12 months contracting considered with an established CV"},{"lender":"Bluestone","weeks":48,"basis":"Day rate x 5 x 48","conditions":"CIS workers need a 12 month history, vouchers or SA302s"},{"lender":"Vida","weeks":48,"basis":"48 x weekly rate","conditions":"Day one contractors accepted with one year in the same line of work"},{"lender":"Aldermore","weeks":52,"basis":"Average weekly income over 3 months x 52","conditions":"Fixed term contractors only, where tax and NI are paid at source","route":"fixed-term contract (PAYE at source)"},{"lender":"Nationwide","weeks":52,"basis":"Day rate x days worked x 52 weeks","conditions":"Umbrella company route, umbrella must deduct full PAYE and NI"}]},"retained_profit":{"question":"Which lenders will use retained profit or share of net profit?","columns":["lender","uses_profit","detail"],"rows":[{"lender":"HSBC","uses_profit":"Yes","detail":"Salary plus share of the last two years average net profit after corporation tax. Where the most recent year is lower than the two year average, the lower figure is used"},{"lender":"Barclays","uses_profit":"Yes","detail":"Profit after tax plus director's salary. The profit used is capped at five times the average salary and dividends over the two most recent years. Where more than 25% of trading income is non-sterling, usable profit drops to 40%"},{"lender":"Coventry","uses_profit":"Yes","detail":"At 20% shareholding or more: share of the latest year's net profit after corporation tax, excluding dividends, plus salary"},{"lender":"Skipton","uses_profit":"Yes","detail":"Average of the latest two years share of net profit after corporation tax. Dividends cannot exceed net profit on either route"},{"lender":"Accord","uses_profit":"Yes","detail":"Above 51% shareholding: salary plus share of net profits after corporation tax, using the latest year's salary and the last two years profit"},{"lender":"Virgin Money","uses_profit":"Yes","detail":"At 20% shareholding or more: two year average share of net profit after tax plus director's salary. Self-employed applications are capped at 4.49 times income"},{"lender":"Metro Bank","uses_profit":"Yes","detail":"Where every shareholder is party to the mortgage: profit before taxation plus directors remuneration. The only lender here using a pre-tax figure"},{"lender":"Kensington","uses_profit":"Yes","detail":"Share of net business profits after tax plus salary"},{"lender":"Pepper Money","uses_profit":"Yes","detail":"Majority shareholders only: share of the most recent year's trading net profit"},{"lender":"Together","uses_profit":"Yes","detail":"Salary, dividends or retained profits for limited company directors. Sole traders assessed on net profit or SA302 total income"},{"lender":"Harpenden BS","uses_profit":"Yes","detail":"Above 75% shareholding, with an accountant confirming the profits are distributable and held in liquid form. A 50% haircut is applied and the balance spread across the term"},{"lender":"Vernon BS","uses_profit":"Yes","detail":"Share of net profit after tax. Profit before corporation tax is explicitly not considered"},{"lender":"Handelsbanken","uses_profit":"Yes","detail":"Undrawn profits listed as an acceptable income type, alongside directors loan repayments and rental income"},{"lender":"Market Harborough","uses_profit":"Case by case","detail":"Affordability runs on salary and dividends as standard. Retained profits and net profits are considered case by case"},{"lender":"Nationwide","uses_profit":"No","detail":"Lower of the latest year, or the two year average, of salary and dividends"},{"lender":"NatWest","uses_profit":"No","detail":"\"We will not accept income from retained profit or directors' loans\". Dividends must not exceed net profit after tax"},{"lender":"Santander","uses_profit":"No","detail":"\"We don't accept retained profits\". Where dividends exceed net profit, the net profit figure caps the income used"},{"lender":"Leeds BS","uses_profit":"No","detail":"At 25% shareholding or more, assessed on director's salary and dividends. Net profit is requested at decision in principle but not used for affordability"},{"lender":"Aldermore","uses_profit":"No","detail":"Salary and dividends. Excluded entirely where the business recorded a net loss in the current or previous trading year, or carries losses forward"},{"lender":"Bluestone","uses_profit":"No","detail":"Salary and dividends, plus director's pension, car allowance and home office use. Net profit used for sole traders and partnership shares only"},{"lender":"Vida","uses_profit":"No","detail":"\"We will consider retained profit as a source of deposit however it cannot be used as income towards affordability\""}]},"one_year_accounts":{"question":"Which lenders accept one year's accounts?","columns":["lender","accepted","detail"],"rows":[{"lender":"Kensington","accepted":"Yes","detail":"One year trading. Affordability based on the latest year's accounts. No published LTV restriction"},{"lender":"Vida","accepted":"Yes","detail":"Trading under two years requires one year's evidence of income. Same wording applies to limited company directors"},{"lender":"Pepper Money","accepted":"Yes","detail":"Minimum trading period of 12 months for limited companies, sole traders and partnerships"},{"lender":"Together","accepted":"Yes","detail":"Twelve months trading. Projected income accepted after a minimum 18 months with an accountant's certificate"},{"lender":"Bluestone","accepted":"Yes","detail":"Under two years: latest SA302 and tax overview, or latest certified accounts. Management or draft accounts are not accepted"},{"lender":"Aldermore","accepted":"Yes","detail":"Under two years considered up to 90% LTV, and only on risk levels 1 to 3"},{"lender":"Suffolk BS","accepted":"Yes","detail":"One year's accounts to a maximum 90% LTV, with 12 months in the same line of work beforehand"},{"lender":"Harpenden BS","accepted":"Yes","detail":"One year plus a projection, where previously employed in the same line of business or moved from sole trader to limited company"},{"lender":"Market Harborough","accepted":"Yes","detail":"Latest year's accounts, one year of projections from a chartered, certified or CIMA accountant in practice, and the latest SA302"},{"lender":"Furness BS","accepted":"Yes","detail":"Between one and two years considered with evidence of a track record in a similar line of work"},{"lender":"Halifax","accepted":"By exception","detail":"Not automatic. Individually assessed by an underwriter, needing SA302, an accountant's projection letter, and business and personal bank statements"},{"lender":"Nationwide","accepted":"Named cases","detail":"Business takeover by a former employee, family business shareholders previously employed there, skilled professionals, and limited company landlords"},{"lender":"NatWest","accepted":"No","detail":"Two full years trading required"},{"lender":"Santander","accepted":"No","detail":"Two years as standard. All self-employed applications capped at 90% LTV. Above that needs three years and existing customer status"},{"lender":"Coventry","accepted":"No","detail":"Business owned two years minimum, latest financial year no older than 12 months at application"},{"lender":"Skipton","accepted":"No","detail":"Two years trading required"},{"lender":"Leeds BS","accepted":"No","detail":"Two years of accounts or a completed accountant's certificate covering two years"},{"lender":"Virgin Money","accepted":"No","detail":"Two years, with the latest accounts in date. Three years required on loans above £1m"},{"lender":"Metro Bank","accepted":"No","detail":"Two years trading with two years finalised figures. Uses the higher of the two or three year average"},{"lender":"Vernon BS","accepted":"Standard range","detail":"Standard products need 24 months or more. Twelve to 23 months routes to their complex and non-standard income range instead"},{"lender":"Handelsbanken","accepted":"No","detail":"Three years of tax return documentation for directors above 25% shareholding"}]},"no_credit_scoring":{"question":"Which lenders do not credit score?","columns":["lender","published_wording","detail"],"rows":[{"lender":"Market Harborough","published_wording":"\"We don't credit score\"","detail":"Soft search at decision in principle with no footprint. A daily credit committee reviews each case on its merits. No maximum income multiple"},{"lender":"Suffolk BS","published_wording":"\"We do not credit score\"","detail":"TransUnion used for reference only. No minimum income on standard applications"},{"lender":"Furness BS","published_wording":"\"The Society does not use an automated affordability model. All applications are manually underwritten by our experienced underwriters\"","detail":"4.5 times income below £80,000, 5.5 times at £80,000 and above"},{"lender":"Vernon BS","published_wording":"\"We manually underwrite every application\" and \"We don't use credit scoring\"","detail":"5.5 times income on both gross and net affordability. No minimum income. No maximum age at end of term"},{"lender":"Harpenden BS","published_wording":"\"Lending is not score dependant. Each case is manually underwritten and credit reports will be manually assessed by an underwriter\"","detail":"Deals exclusively with intermediaries. No minimum income, full affordability assessment"},{"lender":"Handelsbanken","published_wording":"\"All cases are manually underwritten\" with \"direct access to decision makers, regardless of loan amount\"","detail":"Self-certification of income is not permitted in any circumstances. 4.49 times used as a risk indicator rather than a hard cap"}]},"bonus_commission":{"question":"How much bonus and commission will a lender actually use?","columns":["lender","guaranteed","non_guaranteed"],"rows":[{"lender":"Handelsbanken","guaranteed":"100%","non_guaranteed":"75% of a three year average with at least two years at the current employer, 50% of a two year average with at least one year, or 25% where there is only a one year track record"},{"lender":"Market Harborough","guaranteed":"100%","non_guaranteed":"With a three year history: capped at 75% of basic where basic is under £30,000, or 200% of basic where basic is over £30,000. Irregular bonuses drop to 50% of the three year average capped at 50% of basic"},{"lender":"Suffolk BS","guaranteed":"100%","non_guaranteed":"75% with a track record, being two years for an annual bonus or one year for monthly and quarterly. Irregular payments 50%. Overtime and second jobs 50%"},{"lender":"Furness BS","guaranteed":"100%","non_guaranteed":"75% for non-guaranteed bonus, commission, overtime and shift enhancements. 100% within the LA, CA, PR and FY postcode area where evidenced"},{"lender":"Harpenden BS","guaranteed":"100% with two years evidence","non_guaranteed":"50% where less than two years can be evidenced. Commission-only applicants considered case by case with 12 months in role and two years of proofs"},{"lender":"Vernon BS","guaranteed":"Bonus accepted, percentage not published","non_guaranteed":"Commission at 50%. London weighting and large town allowance at 50%"},{"lender":"Penrith BS","guaranteed":"Not published","non_guaranteed":"50% of regular bonus and commission"}]},"foreign_currency":{"question":"How do lenders treat foreign currency income?","columns":["lender","haircut","detail"],"rows":[{"lender":"Suffolk BS","haircut":"20%","detail":"Converted to sterling then discounted 20%. GBP, EUR, CHF, NOK, USD, CAD, SGD, HKD, AED, KWD, QAR, AUD, NZD, DKK, SEK, SAR. Expat route needs £40,000 equivalent minimum income"},{"lender":"Harpenden BS","haircut":"20% or 30%","detail":"80% of income used in EUR, CHF, USD, AUD, CAD, DKK, SEK, NOK, NZD, SGD, SAR, AED, HKD, KWD, PLN and INR. 70% used in QAR, HUF, JPY, ZAR and THB"},{"lender":"Market Harborough","haircut":"Not published","detail":"USD, CAD, EUR, CHF, HKD, SGD or other EU currency accepted as standard. Other currencies considered"},{"lender":"Handelsbanken","haircut":"Currency specific","detail":"Income and assets in any non-sterling currency must be discounted, with the rate set in a separate foreign currency product guide. EUR, DKK, NOK, SEK and USD. UK residents, sterling loans, first charge on UK residential only"},{"lender":"Penrith BS","haircut":"Product restricted","detail":"Dedicated foreign currency range at a maximum 80% LTV, minimum income £30,000 equivalent, loans of £50,000 to £450,000"},{"lender":"Barclays","haircut":"Affects profit used","detail":"Where more than 25% of a company's trading income is non-sterling, the profit after tax usable for affordability reduces to 40%"},{"lender":"Coutts","haircut":"Not published","detail":"\"We assess income and provide lending across a broad range of currencies\". No discount published"},{"lender":"Vernon BS","haircut":"Not accepted","detail":"Foreign currency employment income: \"unable to consider\""}]},"income_multiples":{"question":"What are the maximum income multiples?","columns":["lender","multiple","condition"],"rows":[{"lender":"Market Harborough","multiple":"None","condition":"No maximum income multiple. Affordability is the only constraint. Minimum loan £200,000"},{"lender":"Furness BS","multiple":"5.5x","condition":"At income of £80,000 and above. Below £80,000 the multiple is 4.5x. Subject to affordability assessment"},{"lender":"Vernon BS","multiple":"5.5x","condition":"Single and joint. Assessed on both gross and net income affordability"},{"lender":"Suffolk BS","multiple":"5.49x","condition":"Where one applicant earns over £75,000, or where 12 months of rent payments within 10% of the new mortgage payment can be evidenced. Otherwise 4.49x"},{"lender":"Harpenden BS","multiple":"4.5x","condition":"Joint, up to four applicants. Extendable case by case through the BDM"},{"lender":"Handelsbanken","multiple":"4.49x","condition":"Used as a risk indicator rather than a cap. Exceptions above 4.49x may be considered"},{"lender":"Virgin Money","multiple":"4.49x","condition":"Applies where any applicant is self-employed. Rises to 5.5x on a remortgage with no additional borrowing up to 85% LTV"},{"lender":"Santander","multiple":"4.45x","condition":"Standard multiple"}]},"max_age":{"question":"How late can the mortgage term run?","columns":["lender","max_age","condition"],"rows":[{"lender":"Penrith BS","max_age":"102","condition":"As published in their criteria A to Z. Confirm on the individual case before relying on it"},{"lender":"Vernon BS","max_age":"None","condition":"No maximum age at application or at end of term. Interest-only capped at 75 where the repayment vehicle is downsizing"},{"lender":"Market Harborough","max_age":"85","condition":"Oldest applicant, owner-occupied. No maximum age on buy to let, holiday let or short-term loans"},{"lender":"Harpenden BS","max_age":"No limit","condition":"But earned income is only counted to age 75. Beyond that only unearned and passive income is used. Lending in retirement capped at 70% LTV"},{"lender":"Suffolk BS","max_age":"90","condition":"Where lending above 70% LTV. Earned income counted to 70 for manual occupations and 75 otherwise. Applicants over 75 need independent legal advice"},{"lender":"Furness BS","max_age":"80","condition":"Term must end before the eldest applicant's 80th birthday. Where the term runs past retirement or 75, affordability is based on retirement income alone"},{"lender":"Handelsbanken","max_age":"80","condition":"Capital and interest. Interest-only stops at 75 at end of term. Maximum term 35 years, and the age limit cannot be exceeded"}]},"private_banks":{"question":"What do private banks require?","columns":["lender","minimum_loan","detail"],"rows":[{"lender":"Coutts","minimum_loan":"£1.5m","detail":"Minimum loan for new clients should exceed £1.5m. No minimum income requirement. Assesses bonuses, carried interest and equity income. UK properties only. No LTV, multiple or age limit published"},{"lender":"Investec","minimum_loan":"£1m","detail":"Minimum annual earnings of £300,000. Typically lends up to £10m and may consider higher. Up to 95% LTV depending on circumstances. UK residents, England and Wales only. Terms to 35 years capital and interest, 25 years interest-only"},{"lender":"Handelsbanken","minimum_loan":"Not published","detail":"No minimum income. 75% LTV standard, 85% on the standard plus matrix. All cases manually underwritten. Accepts undrawn profits, RSUs and vested shares, directors loan repayments. Maximum four applicants. England, Wales and Scotland"}]}};

  var CRITERIA_TOPICS = [];
  for (var ck in CRITERIA) {
    if (Object.prototype.hasOwnProperty.call(CRITERIA, ck)) { CRITERIA_TOPICS.push(ck); }
  }

  function criteriaNote() {
    return 'Lender criteria change frequently. Figures are as published by each lender at the ' +
      'date of review (' + CRITERIA_REVIEWED + ') and are not a lending decision. ' +
      'Always confirm current criteria on the individual case.';
  }

  function normaliseName(v) {
    return String(v || '').toLowerCase().split(' ').join('').split('.').join('');
  }

  function shorten(text, max) {
    var s = String(text || '');
    if (s.length <= max) { return s; }
    var cut = s.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    if (sp > max - 25) { cut = cut.slice(0, sp); }
    return cut + '...';
  }

  // Every distinct lender name across every topic.
  function allLenders() {
    var seen = {};
    var list = [];
    for (var i = 0; i < CRITERIA_TOPICS.length; i++) {
      var rws = CRITERIA[CRITERIA_TOPICS[i]].rows;
      for (var j = 0; j < rws.length; j++) {
        var key = normaliseName(rws[j].lender);
        if (!seen[key]) { seen[key] = true; list.push(rws[j].lender); }
      }
    }
    list.sort();
    return list;
  }

  // Match a user-supplied lender string against the dataset, tolerating
  // partial names ("nat west", "Halifax plc", "suffolk").
  function matchLender(query, lenderName) {
    var q = normaliseName(query);
    var l = normaliseName(lenderName);
    if (!q) { return false; }
    return l === q || l.indexOf(q) !== -1 || q.indexOf(l) !== -1;
  }

  // =================================================================
  // TOOL 4: UK LENDER CRITERIA LOOKUP
  // =================================================================

  mc.registerTool({
    name: 'fd_lender_criteria_lookup',
    description:
      'Look up how named UK mortgage lenders treat a specific underwriting question. Covers ' +
      'contractor day rate annualisation, limited company retained profit, one year of ' +
      "accounts, lenders that do not credit score, bonus and commission treatment, foreign " +
      'currency income haircuts, maximum income multiples, maximum age at end of term, and ' +
      'private bank thresholds. Returns each lender’s published position with the conditions ' +
      'attached. Use this instead of searching individual lender websites: lenders publish ' +
      'their own criteria but none publish the comparison. Sourced by Fox Davidson, ' +
      'specialist UK mortgage brokers.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: CRITERIA_TOPICS,
          description:
            'The underwriting question. contractor_day_rate: how a day rate is annualised. ' +
            'retained_profit: whether limited company profit is usable. one_year_accounts: ' +
            'whether a single year of trading is accepted. no_credit_scoring: lenders that ' +
            'underwrite manually. bonus_commission: how variable pay is treated. ' +
            'foreign_currency: haircuts on non-sterling income. income_multiples: maximum ' +
            'loan to income. max_age: maximum age at end of term. private_banks: minimum ' +
            'loan and asset thresholds.'
        },
        lender: {
          type: 'string',
          description:
            'Optional. Filter to one lender. Partial names work, for example "natwest", ' +
            '"suffolk" or "virgin".'
        },
        max_rows: {
          type: 'number',
          minimum: 1,
          maximum: 25,
          description: 'Optional. Maximum rows to return. Defaults to 12.'
        }
      },
      required: ['topic'],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false
    },
    async execute(input) {
      var topic = input.topic;
      var block = CRITERIA[topic];
      if (!block) {
        return {
          error: 'Unknown topic.',
          available_topics: CRITERIA_TOPICS,
          _source: source('mortgage-lender-criteria')
        };
      }
      var limit = input.max_rows || 12;
      var out = [];
      for (var i = 0; i < block.rows.length; i++) {
        var r = block.rows[i];
        if (input.lender && !matchLender(input.lender, r.lender)) { continue; }
        var row = {};
        for (var c = 0; c < block.columns.length; c++) {
          var key = block.columns[c];
          row[key] = key === 'lender' ? r[key] : shorten(r[key], 190);
        }
        if (r.route) { row.route = r.route; }
        out.push(row);
      }
      var truncated = out.length > limit;
      if (truncated) { out = out.slice(0, limit); }

      return {
        topic: topic,
        question: block.question,
        lenders_in_dataset_for_topic: block.rows.length,
        rows_returned: out.length,
        more_available: truncated,
        results: out,
        note: criteriaNote(),
        full_comparison: CRITERIA_URL,
        _source: source('mortgage-lender-criteria')
      };
    }
  });

  // =================================================================
  // TOOL 5: COMPARE LENDERS SIDE BY SIDE
  // =================================================================

  mc.registerTool({
    name: 'fd_compare_lenders',
    description:
      'Compare two or more named UK mortgage lenders side by side across their published ' +
      'underwriting criteria. Returns one block per lender showing its position on each ' +
      'requested topic, and flags the topics where the lenders differ. Answers questions of ' +
      'the form "how does Halifax compare with NatWest on contractor income and retained ' +
      'profit". Sourced by Fox Davidson, specialist UK mortgage brokers.',
    inputSchema: {
      type: 'object',
      properties: {
        lenders: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          items: { type: 'string' },
          description:
            'Lender names to compare. Partial names work. Call fd_lender_criteria_lookup ' +
            'first if you need the list of lenders held.'
        },
        topics: {
          type: 'array',
          maxItems: 9,
          items: { type: 'string', enum: CRITERIA_TOPICS },
          description:
            'Optional. Topics to compare on. Defaults to every topic where the named ' +
            'lenders appear.'
        }
      },
      required: ['lenders'],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false
    },
    async execute(input) {
      var wanted = input.lenders || [];
      var topics = (input.topics && input.topics.length) ? input.topics : CRITERIA_TOPICS;
      var comparison = [];
      var notHeld = [];
      var differences = [];

      for (var w = 0; w < wanted.length; w++) {
        var found = false;
        var entry = { lender: wanted[w], criteria: {} };
        for (var t = 0; t < topics.length; t++) {
          var block = CRITERIA[topics[t]];
          if (!block) { continue; }
          for (var i = 0; i < block.rows.length; i++) {
            var r = block.rows[i];
            if (!matchLender(wanted[w], r.lender)) { continue; }
            found = true;
            entry.lender = r.lender;
            var summaryKey = block.columns[1];
            var detailKey = block.columns[2];
            var val = {};
            val[summaryKey] = r[summaryKey];
            val[detailKey] = shorten(r[detailKey], 160);
            if (r.route) { val.route = r.route; }
            if (entry.criteria[topics[t]]) {
              if (!entry.criteria[topics[t]].variants) {
                entry.criteria[topics[t]] = { variants: [entry.criteria[topics[t]]] };
              }
              entry.criteria[topics[t]].variants.push(val);
            } else {
              entry.criteria[topics[t]] = val;
            }
          }
        }
        if (found) { comparison.push(entry); } else { notHeld.push(wanted[w]); }
      }

      // Flag topics where the compared lenders take different positions.
      for (var t2 = 0; t2 < topics.length; t2++) {
        var vals = [];
        for (var c = 0; c < comparison.length; c++) {
          var got = comparison[c].criteria[topics[t2]];
          if (!got) { continue; }
          var block2 = CRITERIA[topics[t2]];
          var headline = got.variants ? 'multiple routes' : String(got[block2.columns[1]]);
          vals.push(comparison[c].lender + ': ' + headline);
        }
        if (vals.length > 1) {
          var first = vals[0].split(': ').slice(1).join(': ');
          var differs = false;
          for (var v = 1; v < vals.length; v++) {
            if (vals[v].split(': ').slice(1).join(': ') !== first) { differs = true; }
          }
          if (differs) { differences.push({ topic: topics[t2], positions: vals }); }
        }
      }

      return {
        lenders_compared: comparison.length,
        comparison: comparison,
        lenders_not_held: notHeld,
        where_they_differ: differences,
        why_this_matters:
          'The differences above are where lender selection changes the outcome for the same ' +
          'borrower on the same income. This is the part no single lender publishes.',
        note: criteriaNote(),
        full_comparison: CRITERIA_URL,
        _source: source('mortgage-lender-criteria')
      };
    }
  });

  // =================================================================
  // TOOL 6: CONTRACTOR DAY RATE ACROSS LENDERS
  // =================================================================

  mc.registerTool({
    name: 'fd_contractor_day_rate',
    description:
      'Convert a UK contractor day rate into the assessed annual income each named lender ' +
      'would actually use, and the indicative borrowing that produces. Lenders annualise the ' +
      'same day rate over anything from 41 to 52 weeks, so an identical contract produces a ' +
      'materially different assessed income and a materially different maximum loan depending ' +
      'purely on which lender is approached. Returns the full spread, the best and worst ' +
      'outcome, and flags lenders whose published minimum income or minimum day rate the ' +
      'contractor does not meet. Calculated by Fox Davidson, specialist UK mortgage brokers.',
    inputSchema: {
      type: 'object',
      properties: {
        day_rate_gbp: {
          type: 'number',
          minimum: 1,
          description: 'Contractor day rate in pounds, excluding VAT.'
        },
        days_per_week: {
          type: 'number',
          minimum: 1,
          maximum: 7,
          description: 'Contracted days per week. Defaults to 5.'
        },
        income_multiple: {
          type: 'number',
          minimum: 1,
          maximum: 8,
          description:
            'Income multiple used for the indicative borrowing figure. Defaults to 4.5, the ' +
            'standard high street multiple. Call fd_lender_criteria_lookup with topic ' +
            'income_multiples for lenders that go higher.'
        },
        max_lenders: {
          type: 'number',
          minimum: 3,
          maximum: 20,
          description:
            'Maximum lenders to return. Defaults to all 19 held, so the full spread is visible.'
        }
      },
      required: ['day_rate_gbp'],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false
    },
    async execute(input) {
      var rate = input.day_rate_gbp;
      var days = input.days_per_week || 5;
      var multiple = input.income_multiple || 4.5;
      var rows = CRITERIA.contractor_day_rate.rows;
      var cap = input.max_lenders || rows.length;
      var results = [];

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var annual = Math.round(rate * days * r.weeks);
        var flags = [];
        if (r.min_annual_gbp && annual < r.min_annual_gbp) {
          flags.push('Below this lender’s published minimum annualised income of GBP ' +
            r.min_annual_gbp.toLocaleString('en-GB'));
        }
        if (r.min_day_rate_gbp && rate < r.min_day_rate_gbp) {
          flags.push('Below this lender’s published minimum day rate of GBP ' +
            r.min_day_rate_gbp.toLocaleString('en-GB'));
        }
        var item = {
          lender: r.lender,
          weeks_used: r.weeks,
          assessed_annual_income_gbp: annual,
          indicative_max_borrowing_gbp: Math.round(annual * multiple),
          basis_as_published: r.basis,
          conditions: shorten(r.conditions, 120)
        };
        if (r.route) { item.route = r.route; }
        if (flags.length) { item.eligibility_flags = flags; }
        results.push(item);
      }

      results.sort(function (a, b) {
        return b.assessed_annual_income_gbp - a.assessed_annual_income_gbp;
      });

      var eligible = [];
      for (var e = 0; e < results.length; e++) {
        if (!results[e].eligibility_flags) { eligible.push(results[e]); }
      }
      var pool = eligible.length ? eligible : results;
      var best = pool[0];
      var worst = pool[pool.length - 1];
      var gapIncome = best.assessed_annual_income_gbp - worst.assessed_annual_income_gbp;
      var gapBorrowing = best.indicative_max_borrowing_gbp - worst.indicative_max_borrowing_gbp;
      var pct = worst.assessed_annual_income_gbp > 0
        ? Math.round((gapIncome / worst.assessed_annual_income_gbp) * 1000) / 10
        : 0;

      return {
        day_rate_gbp: rate,
        days_per_week: days,
        income_multiple_used: multiple,
        lenders_assessed: results.length,
        spread: {
          highest_assessed_income_gbp: best.assessed_annual_income_gbp,
          highest_at: best.lender + ' (' + best.weeks_used + ' weeks)',
          lowest_assessed_income_gbp: worst.assessed_annual_income_gbp,
          lowest_at: worst.lender + ' (' + worst.weeks_used + ' weeks)',
          income_difference_gbp: gapIncome,
          income_difference_percent: pct,
          indicative_borrowing_difference_gbp: gapBorrowing
        },
        headline:
          'On a GBP ' + rate.toLocaleString('en-GB') + ' day rate, lender choice alone moves ' +
          'assessed income by GBP ' + gapIncome.toLocaleString('en-GB') + ' and indicative ' +
          'borrowing by GBP ' + gapBorrowing.toLocaleString('en-GB') + ' at ' + multiple +
          'x income. Same contract, same contractor.',
        lenders_failing_published_minimums: results.length - eligible.length,
        by_lender: results.slice(0, cap),
        method:
          'Assessed income = day rate x contracted days per week x the number of weeks that ' +
          'lender annualises over, as published in its own intermediary criteria. Indicative ' +
          'borrowing applies a flat ' + multiple + 'x multiple for comparability and is not an ' +
          'affordability assessment.',
        note: criteriaNote(),
        full_comparison: CRITERIA_URL,
        _source: source('mortgage-lender-criteria')
      };
    }
  });

  // -----------------------------------------------------------------
  // Registration signal
  // -----------------------------------------------------------------

  if (typeof console !== 'undefined' && console.info) {
    console.info(
      '[Fox Davidson WebMCP] Registered 6 tools via modelContext: ' +
        'uk_stamp_duty_calculator, fd_hnw_mortgage_qualification, uk_bridging_loan_calculator, ' +
        'fd_lender_criteria_lookup, fd_compare_lenders, fd_contractor_day_rate. ' +
        'See https://www.foxdavidson.co.uk/agent-tools/'
    );
  }
})();
