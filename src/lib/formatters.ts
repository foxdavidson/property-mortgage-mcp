/**
 * Number formatting helpers. Used in the human-readable text content of
 * each tool response. The structured JSON content uses raw numbers so AI
 * clients and downstream systems can compute on them directly.
 */

/**
 * Format a number as GBP, no decimals, with thousands separators.
 * 123456.78 -> "GBP 123,457"
 */
export function gbp(n: number): string {
  if (!isFinite(n)) return "-";
  return "GBP " + Math.round(n).toLocaleString("en-GB", { useGrouping: true });
}

/**
 * Format a number as a percentage with two decimal places.
 * Pass `alreadyPercent: true` if the input is already in percent form.
 */
export function pct(n: number, alreadyPercent = false): string {
  if (!isFinite(n)) return "-";
  const value = alreadyPercent ? n : n * 100;
  return value.toFixed(2) + "%";
}
