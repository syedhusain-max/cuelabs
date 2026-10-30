/**
 * Free AI search, browser side: turns a search into a compact fingerprint with an
 * open-source model running in the visitor's browser. The model (~23 MB) is
 * downloaded once and cached by the browser. Returns null if anything fails, so
 * callers can fall back to normal search.
 */
import { SEARCH_EMBEDDING_MODEL, encodeSearchVector } from "./search-vector";

// Same library version the build step uses (package.json), loaded from a CDN so
// it is never bundled into the site.
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean }
) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;

function loadExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const lib = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ TRANSFORMERS_URL);
      lib.env.allowLocalModels = false;
      return (await lib.pipeline("feature-extraction", SEARCH_EMBEDDING_MODEL, { dtype: "q8" })) as Extractor;
    })();
    extractorPromise.catch(() => {
      extractorPromise = null;
    });
  }
  return extractorPromise;
}

/** Start downloading the model early (e.g. when AI search is switched on). */
export function preloadSearchModel(): void {
  loadExtractor().catch(() => {});
}

/** Returns the encoded fingerprint for a search, or null if it can't be made. */
export async function embedSearchQuery(query: string, timeoutMs = 60000): Promise<string | null> {
  const text = query.trim();
  if (!text) return null;
  try {
    const work = (async () => {
      const extractor = await loadExtractor();
      const output = await extractor([text], { pooling: "mean", normalize: true });
      return encodeSearchVector(output.tolist()[0]);
    })();
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return await Promise.race([work, timeout]);
  } catch (error) {
    console.warn("AI search model unavailable, using normal search:", error);
    return null;
  }
}
