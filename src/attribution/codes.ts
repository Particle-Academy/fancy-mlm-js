import { InvalidInput } from "./errors";
import { webCrypto } from "./webcrypto";

/**
 * Digits plus lowercase letters without i, l, o and u. 32 letters, so
 * `byte & 31` maps every random byte with no modulo bias. Mirror of PHP
 * `ReferralCodes::ALPHABET`.
 */
export const CODE_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const CODE_DEFAULT_LENGTH = 16;
export const CODE_MIN_LENGTH = 12;
export const CODE_MAX_LENGTH = 64;

/** A referral code from the CSPRNG. The default 16 characters is 80 bits. */
export function generateCode(length: number = CODE_DEFAULT_LENGTH): string {
  if (!Number.isInteger(length) || length < CODE_MIN_LENGTH || length > CODE_MAX_LENGTH) {
    throw new InvalidInput("length", `Referral codes are ${CODE_MIN_LENGTH} to ${CODE_MAX_LENGTH} characters; ${length} is outside that.`);
  }
  const bytes = webCrypto().getRandomValues(new Uint8Array(length));
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte & 31];
  return code;
}

/** Exactly PHP's trim() set: space, tab, LF, CR, NUL, vertical tab. Not Unicode whitespace. */
const PHP_TRIM = new Set([" ", "\t", "\n", "\r", "\0", "\x0B"]);

function phpTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && PHP_TRIM.has(value[start]!)) start++;
  while (end > start && PHP_TRIM.has(value[end - 1]!)) end--;
  return value.slice(start, end);
}

/** ASCII-only lowercase, like PHP 8 strtolower(). toLowerCase() maps KELVIN SIGN to "k". */
function asciiLower(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : value[i];
  }
  return out;
}

/**
 * Trim and lowercase a code as typed or scanned; null for anything that is not
 * a well-formed code. No regular expression, so nothing to backtrack on.
 */
export function normalizeCode(code: string): string | null {
  const normalized = asciiLower(phpTrim(code));
  if (normalized.length < CODE_MIN_LENGTH || normalized.length > CODE_MAX_LENGTH) return null;
  for (const ch of normalized) {
    if (!CODE_ALPHABET.includes(ch)) return null;
  }
  return normalized;
}
