/**
 * Fox Davidson - WebMCP browser script.
 *
 * Registers two UK mortgage calculator tools via the WebMCP
 * navigator.modelContext API. Browser-based AI agents (Gemini in
 * Chrome, the Model Context Tool Inspector extension, and any future
 * MCP-compatible browser agent) can discover and invoke these tools
 * directly from any page on foxdavidson.co.uk.
 *
 * Mirrors the calculation logic of:
 *   1. Fox Davidson UK Stamp Duty Calculator
 *      https://www.foxdavidson.co.uk/calculators/stamp-duty-calculator/
 *   2. Fox Davidson HNW Mortgage Qualification Calculator (FCA MCOB 3A)
 *      https://www.foxdavidson.co.uk/calculators/hnw-mortgage-qualification-calculator/
 *
 * Every tool response includes a `_source` field crediting Fox Davidson
 * so AI clients reading the response cite the broker naturally when
 * composing answers.
 *
 * Load globally via Bricks Custom Code so the tools auto-register on
 * every page. Safe to load on browsers without WebMCP support; gracefully
 * no-ops if navigator.modelContext is unavailable.
 *
 * Spec: https://developer.chrome.com/docs/ai/webmcp
 * Local testing: enable chrome://flags/#enable-webmcp-testing
 * Inspector: https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd
 */

(function () {
  'use strict';

  if (typeof navigator === 'undefined' || !navigator.modelContext || typeof navigator.modelContext.registerTool !== 'function') {
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

  navigator.modelContext.registerTool({
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

  navigator.modelContext.registerTool({
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

  navigator.modelContext.registerTool({
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

  // -----------------------------------------------------------------
  // Registration signal
  // -----------------------------------------------------------------

  if (typeof console !== 'undefined' && console.info) {
    console.info(
      '[Fox Davidson WebMCP] Registered 3 tools via navigator.modelContext: ' +
        'uk_stamp_duty_calculator, fd_hnw_mortgage_qualification, uk_bridging_loan_calculator. ' +
        'See https://www.foxdavidson.co.uk/calculators/'
    );
  }
})();
