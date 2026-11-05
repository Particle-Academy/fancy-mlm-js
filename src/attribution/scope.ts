import { InvalidInput } from "./errors";
import { utf8 } from "./webcrypto";

export const SCOPE_MAX_BYTES = 191;

/** A host-defined scope: an opaque string, or a tuple of strings. */
export type ScopeInput = string | readonly string[];

/** RFC 3986 encoding, byte-identical to PHP rawurlencode(). */
function rawurlencode(part: string): string {
  let encoded: string;
  try {
    encoded = encodeURIComponent(part);
  } catch {
    throw new InvalidInput("scope", "A scope part is not valid Unicode (lone surrogate).");
  }
  // encodeURIComponent leaves these sub-delims alone; rawurlencode does not.
  return encoded.replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * The canonical key for a scope. A tuple's parts are RFC 3986-encoded and
 * joined with ":", so a part containing a colon cannot collide with two parts.
 * Mirror of PHP `Scope::key()`.
 */
export function scopeKey(scope: ScopeInput): string {
  let key: string;
  if (Array.isArray(scope)) {
    if (scope.length === 0) throw new InvalidInput("scope", "A scope tuple needs at least one part.");
    key = scope
      .map((part) => {
        if (typeof part !== "string" || part === "") {
          throw new InvalidInput("scope", "Every part of a scope tuple must be a non-empty string.");
        }
        return rawurlencode(part);
      })
      .join(":");
  } else {
    key = scope as string;
  }
  if (key === "") throw new InvalidInput("scope", "A scope cannot be empty.");
  if (utf8(key).length > SCOPE_MAX_BYTES) throw new InvalidInput("scope", `A scope key is at most ${SCOPE_MAX_BYTES} bytes.`);
  return key;
}
