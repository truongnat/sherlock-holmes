import type { QueryType } from "./types.ts";

/**
 * Automatically detects the most likely QueryType for a given input string.
 */
export function detectQueryType(value: string): QueryType {
  const trimmed = value.trim();

  // 1. URL Detection
  if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) {
    return "url";
  }

  // 2. Email Detection
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "email";
  }

  // 3. Phone Detection (Basic)
  // Matches +84..., 090..., etc.
  const phoneStrip = trimmed.replace(/[\s-()]/g, "");
  if (/^\+?\d{9,15}$/.test(phoneStrip)) {
    return "phone";
  }

  // 4. Fullname Detection
  // If it has spaces and contains letters, it's likely a name
  if (trimmed.includes(" ") && /[a-zA-Z\u00C0-\u017F]/.test(trimmed)) {
    return "fullname";
  }

  // 5. Default to Username
  return "username";
}
