/** Money is integer cents everywhere. These are the only conversion points. */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCents(cents: number, opts?: { whole?: boolean }): string {
  return (opts?.whole ? usdWhole : usd).format(cents / 100);
}

/** Parses "1,800", "$1800.50" or "1800.5" into cents. Throws on anything else. */
export function parseDollars(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Not a valid dollar amount: "${input}"`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Splits a total into n parts that sum exactly. Any remainder goes on the first. */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 1) throw new Error("parts must be >= 1");
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => (i === 0 ? base + remainder : base));
}
