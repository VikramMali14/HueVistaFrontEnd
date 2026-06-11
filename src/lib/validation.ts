/**
 * Pure validation helpers shared by the public-facing forms
 * (trial sign-up, forgot password, access-code redemption).
 *
 * Each `validate*` function returns a human-friendly error message,
 * or `null` when the value is valid — so callers can do
 * `const msg = validateX(value); if (msg) showError(msg);`.
 */

/** Shape after stripping spaces / hyphens / parentheses: optional leading +, then digits. */
export const PHONE_COMPACT_RE = /^\+?[0-9]+$/;

export const PHONE_ERROR_MESSAGE = "Enter a valid phone number, e.g. +91 98765 43210.";

/**
 * Accepts an Indian mobile in the formats people actually type:
 * 10 digits ("98765 43210"), 0-prefixed domestic ("098765 43210"),
 * or country-coded ("+91 98765 43210", with or without the +).
 * Spaces, hyphens and parentheses are stripped before checking;
 * letters and any other symbols are rejected. A bare 11-digit number
 * that is neither 0-prefixed nor country-coded is rejected as malformed.
 */
export function validatePhone(value: string): string | null {
  const compact = value.trim().replace(/[\s\-()]/g, "");
  if (!PHONE_COMPACT_RE.test(compact)) return PHONE_ERROR_MESSAGE;
  const hasPlus = compact.startsWith("+");
  const digits = hasPlus ? compact.slice(1) : compact;
  const valid =
    digits.length === 10 ||
    (!hasPlus && digits.length === 11 && digits.startsWith("0")) ||
    (hasPlus && digits.length >= 11 && digits.length <= 13) ||
    (!hasPlus && digits.length >= 12 && digits.length <= 13);
  return valid ? null : PHONE_ERROR_MESSAGE;
}

/** Pragmatic email shape: one @, non-empty local part, domain with a dot, no spaces. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_ERROR_MESSAGE = "Enter a valid email address.";

export function validateEmail(value: string): string | null {
  return EMAIL_RE.test(value.trim()) ? null : EMAIL_ERROR_MESSAGE;
}

/** Backend access-code column is exactly 8 characters (e.g. 7K2NQ9PX). */
export const ACCESS_CODE_LENGTH = 8;

/** Matches a normalized (trimmed, uppercased) access code. */
export const ACCESS_CODE_RE = /^[A-Z0-9]{8}$/;

export const ACCESS_CODE_ERROR_MESSAGE = "Access codes are 8 letters and numbers.";

/** Canonical form of an access code: trimmed and uppercased. */
export function normalizeAccessCode(value: string): string {
  return value.trim().toUpperCase();
}

export function validateAccessCode(value: string): string | null {
  return ACCESS_CODE_RE.test(normalizeAccessCode(value)) ? null : ACCESS_CODE_ERROR_MESSAGE;
}
