import { phpTrim } from "./codes";
import { InvalidInput } from "./errors";
import { utf8 } from "./webcrypto";

/** A reason is at most this many UTF-8 bytes, after trimming. Mirror of PHP `SponsorCorrection::REASON_MAX_BYTES`. */
export const CORRECTION_REASON_MAX_BYTES = 1000;

/** An actor id is at most this many UTF-8 bytes. Mirror of PHP `SponsorCorrection::ACTOR_MAX_BYTES`. */
export const CORRECTION_ACTOR_MAX_BYTES = 191;

/** False for a string holding a lone surrogate, which has no UTF-8 encoding. */
function isWellFormed(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The reason as stored: trimmed with PHP trim() semantics (ASCII whitespace and
 * NUL only, NOT String.prototype.trim), non-empty, well-formed and at most
 * {@link CORRECTION_REASON_MAX_BYTES} UTF-8 bytes.
 */
export function normalizeCorrectionReason(reason: string): string {
  const trimmed = phpTrim(reason);
  if (trimmed === "") throw new InvalidInput("reason", "A sponsor correction needs a reason.");
  if (!isWellFormed(trimmed)) throw new InvalidInput("reason", "The reason must be valid Unicode.");
  if (utf8(trimmed).length > CORRECTION_REASON_MAX_BYTES) {
    throw new InvalidInput("reason", `The reason is at most ${CORRECTION_REASON_MAX_BYTES} bytes.`);
  }
  return trimmed;
}

/** The actor id is stored as given: non-empty after trimming, well-formed, at most {@link CORRECTION_ACTOR_MAX_BYTES} UTF-8 bytes. */
export function assertCorrectionActor(actorId: string): void {
  if (phpTrim(actorId) === "") throw new InvalidInput("actorId", "A sponsor correction names the actor who made it.");
  if (!isWellFormed(actorId)) throw new InvalidInput("actorId", "The actor id must be valid Unicode.");
  if (utf8(actorId).length > CORRECTION_ACTOR_MAX_BYTES) {
    throw new InvalidInput("actorId", `The actor id is at most ${CORRECTION_ACTOR_MAX_BYTES} bytes.`);
  }
}
