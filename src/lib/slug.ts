/**
 * Slug utility for multi-tenant vendor URLs.
 * Converts a business name to a clean, URL-safe slug.
 * e.g. "Tal Farage Laundry" → "tal-farage-laundry"
 */
export function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    // Transliterate common Hebrew chars to latin approximations
    .replace(/[\u05d0-\u05ea]/g, (c) => hebrewToLatin[c] ?? "")
    // Replace spaces and non-alphanumeric chars with dashes
    .replace(/[^a-z0-9]+/g, "-")
    // Collapse consecutive dashes
    .replace(/-{2,}/g, "-")
    // Strip leading/trailing dashes
    .replace(/^-+|-+$/g, "");
}

/** Minimal Hebrew → Latin map for slug generation */
const hebrewToLatin: Record<string, string> = {
  "\u05d0": "a",  // א
  "\u05d1": "b",  // ב
  "\u05d2": "g",  // ג
  "\u05d3": "d",  // ד
  "\u05d4": "h",  // ה
  "\u05d5": "v",  // ו
  "\u05d6": "z",  // ז
  "\u05d7": "ch", // ח
  "\u05d8": "t",  // ט
  "\u05d9": "y",  // י
  "\u05da": "k",  // ך
  "\u05db": "k",  // כ
  "\u05dc": "l",  // ל
  "\u05dd": "m",  // ם
  "\u05de": "m",  // מ
  "\u05df": "n",  // ן
  "\u05e0": "n",  // נ
  "\u05e1": "s",  // ס
  "\u05e2": "a",  // ע
  "\u05e3": "p",  // ף
  "\u05e4": "p",  // פ
  "\u05e5": "tz", // ץ
  "\u05e6": "tz", // צ
  "\u05e7": "k",  // ק
  "\u05e8": "r",  // ר
  "\u05e9": "sh", // ש
  "\u05ea": "t",  // ת
};
