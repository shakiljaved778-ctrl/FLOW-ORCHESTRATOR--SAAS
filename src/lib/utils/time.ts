/** Time helpers. QFC audit reports require both UTC and Qatar local time. */

export const QATAR_TZ = "Asia/Qatar";

/** ISO-8601 UTC timestamp for the given date (default: now). */
export function utcNow(date: Date = new Date()): string {
  return date.toISOString();
}

/** Human-readable Qatar-local timestamp, e.g. "2026-09-09 14:30:00". */
export function qatarLocal(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: QATAR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", "");
}
