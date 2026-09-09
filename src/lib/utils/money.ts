/**
 * Money is represented throughout the orchestrator as an integer number of
 * minor units (halalas for QAR, fils for AED, cents for USD). Never use floats
 * for money — they accumulate rounding error that breaks ledger balancing.
 */

/** Minor units per major unit for supported currencies (all 2-decimal here). */
const MINOR_UNITS_EXPONENT: Record<string, number> = {
  QAR: 2,
  AED: 2,
  USD: 2,
};

export function exponentFor(currency: string): number {
  const exp = MINOR_UNITS_EXPONENT[currency.toUpperCase()];
  if (exp === undefined) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return exp;
}

/** Convert a major-unit decimal string/number (e.g. "10.50") to minor units (1050). */
export function toMinorUnits(amount: string | number, currency: string): number {
  const exp = exponentFor(currency);
  const factor = 10 ** exp;
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  // Round to the nearest minor unit to absorb float representation noise.
  return Math.round(value * factor);
}

/** Convert minor units (1050) back to a major-unit decimal string ("10.50"). */
export function fromMinorUnits(minor: number, currency: string): string {
  const exp = exponentFor(currency);
  const factor = 10 ** exp;
  return (minor / factor).toFixed(exp);
}

/** Format minor units for display, e.g. "QAR 10.50". */
export function formatMoney(minor: number, currency: string): string {
  return `${currency.toUpperCase()} ${fromMinorUnits(minor, currency)}`;
}
