/**
 * Shared settings for free AI search, used by the browser, the server and the
 * build step. Must stay free of imports so it runs everywhere.
 *
 * How it works: the visitor's browser turns a search into a "fingerprint"
 * (embedding) with a small open-source model, packs it into ~500 characters and
 * puts it in the page address as `v=`. The server compares it with the
 * fingerprints stored for each prompt (created during the build with the same model).
 */

/** Open-source sentence model (Hugging Face). Prompts and searches must use the same one. */
export const SEARCH_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const SEARCH_EMBEDDING_DIMS = 384;
/** Same text layout for every prompt fingerprint. */
export function promptTextForEmbedding(p: { title: string; description: string | null; content: string }): string {
  return [p.title, p.description || "", p.content].join("\n\n").trim();
}

// Vectors are normalized, so every value is between -1 and 1. Storing each as a
// signed byte keeps search quality and makes the vector short enough for a URL.
const SCALE = 127;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeSearchVector(vector: number[]): string {
  const bytes = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    bytes[i] = Math.max(-SCALE, Math.min(SCALE, Math.round(vector[i] * SCALE)));
  }
  return toBase64Url(new Uint8Array(bytes.buffer));
}

/** Returns null if the text is not a valid search vector. */
export function decodeSearchVector(text: string | null | undefined): number[] | null {
  if (!text || text.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const bytes = new Int8Array(fromBase64Url(text).buffer);
    if (bytes.length !== SEARCH_EMBEDDING_DIMS) return null;
    return Array.from(bytes, (b) => b / SCALE);
  } catch {
    return null;
  }
}
