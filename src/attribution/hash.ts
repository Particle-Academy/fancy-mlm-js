import { InvalidInput } from "./errors";
import { hex, utf8, webCrypto } from "./webcrypto";

/**
 * Turns a session identifier into the only form the package stores: HMAC-SHA256
 * under a secret key, as lowercase hex. There is no unkeyed mode. Mirror of PHP
 * `SessionHasher`; the shared fixture pins RFC 4231 test case 2.
 */
export class SessionHasher {
  readonly #key: Uint8Array;
  #cryptoKey: Promise<unknown> | null = null;

  constructor(key: string) {
    if (typeof key !== "string" || key === "") {
      throw new InvalidInput("key", "The session hash key cannot be empty: an unkeyed hash is reversible by dictionary.");
    }
    this.#key = utf8(key);
  }

  async hash(sessionId: string): Promise<string> {
    if (typeof sessionId !== "string" || sessionId === "") {
      throw new InvalidInput("sessionId", "A session id cannot be empty.");
    }
    const subtle = webCrypto().subtle;
    this.#cryptoKey ??= subtle.importKey("raw", this.#key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await subtle.sign("HMAC", await this.#cryptoKey, utf8(sessionId));
    return hex(new Uint8Array(signature));
  }

  toJSON(): string {
    return "[SessionHasher]";
  }
}
