/**
 * The slice of Web Crypto and TextEncoder this package uses, typed locally so
 * the package stays isomorphic (Node 22+, browsers, workers) without pulling in
 * DOM or Node type libraries.
 */
interface SubtleLike {
  importKey(format: "raw", key: Uint8Array, algorithm: { name: "HMAC"; hash: "SHA-256" }, extractable: false, usages: ["sign"]): Promise<unknown>;
  sign(algorithm: "HMAC", key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
}

interface CryptoLike {
  getRandomValues<T extends Uint8Array>(array: T): T;
  subtle: SubtleLike;
}

interface EncoderLike {
  encode(input: string): Uint8Array;
}

export function webCrypto(): CryptoLike {
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto;
  if (!crypto?.subtle || typeof crypto.getRandomValues !== "function") {
    throw new Error("fancy-mlm: Web Crypto is required (Node 22+ or any modern browser).");
  }
  return crypto;
}

let encoder: EncoderLike | null = null;

/** UTF-8 bytes of a string. */
export function utf8(input: string): Uint8Array {
  encoder ??= new (globalThis as unknown as { TextEncoder: new () => EncoderLike }).TextEncoder();
  return encoder.encode(input);
}

export function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
