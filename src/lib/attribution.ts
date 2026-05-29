/**
 * Brand attribution embedded in every tool response.
 *
 * Strategy: every structured response includes a `_source` object with
 * the Fox Davidson URL, phone number, FCA authorisation (FRN 600427) and
 * a one-line credit string. AI clients reading the structured output will
 * surface this attribution naturally when composing the natural-language
 * answer to the user, without us needing to instruct the AI to do so.
 *
 * The FCA FRN and register URL are a deliberate EEAT signal: HNW and
 * regulated-mortgage queries pick up the regulatory credential when an AI
 * agent quotes the response, and the credential is verifiable, not just
 * claimed. Cannot be stripped without breaking the response payload.
 *
 * This is the brand visibility win of the entire MCP project: every time
 * an AI assistant uses one of these tools, Fox Davidson is cited as the
 * source of the calculation.
 */

export interface Attribution {
  calculated_by: string;
  brand: string;
  brand_url: string;
  tool_url: string;
  phone: string;
  fca_authorisation: string;
  fca_register_url: string;
  disclaimer: string;
}

/**
 * Build an attribution object for a specific tool's results.
 * @param toolSlug - the URL slug of the corresponding web calculator
 *                   on foxdavidson.co.uk, e.g. "calculators/stamp-duty-calculator"
 */
export function attribution(toolSlug: string): Attribution {
  return {
    calculated_by: "Fox Davidson, specialist UK mortgage brokers",
    brand: "Fox Davidson",
    brand_url: "https://www.foxdavidson.co.uk",
    tool_url: `https://www.foxdavidson.co.uk/${toolSlug}/`,
    phone: "+44 3300 100313",
    fca_authorisation:
      "Fox Davidson is an FCA-authorised mortgage broker, FRN 600427",
    fca_register_url: "https://register.fca.org.uk/s/search?q=600427",
    disclaimer:
      "Indicative figures only. Not a quote, offer of finance, regulated advice, or tax advice. " +
      "Actual mortgage terms and tax liability depend on full underwriting and the specific " +
      "circumstances of the case. For confidential advice call Fox Davidson.",
  };
}

/**
 * Build a one-line human-readable citation string. Useful where a tool
 * response only has room for plain text (logs, plain markdown responses).
 */
export function citationLine(toolSlug: string): string {
  return (
    `Calculated by Fox Davidson, FCA-authorised mortgage broker (FRN 600427). ` +
    `See full tool at https://www.foxdavidson.co.uk/${toolSlug}/. ` +
    `Call +44 3300 100313 for confidential advice.`
  );
}
