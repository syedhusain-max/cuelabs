/**
 * Build-time embeddings for AI search (used only by prisma/embed-all.ts).
 *
 * Runs the same free, open-source model the visitor's browser uses for searches
 * (see src/lib/ai/search-vector.ts), so prompt and search fingerprints match.
 * Deliberately outside src/ so the model never ends up in the site's server
 * functions (Vercel's free plan limits their number and size).
 */
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

import { SEARCH_EMBEDDING_MODEL } from "../src/lib/ai/search-vector";

export const LOCAL_EMBEDDING_MODEL = SEARCH_EMBEDDING_MODEL;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = process.env.LOCAL_EMBEDDING_CACHE_DIR || ".cache/transformers";
      env.allowLocalModels = false;
      // Cast avoids a TypeScript "union type too complex" error from pipeline()'s overloads.
      const createPipeline = pipeline as unknown as (
        task: "feature-extraction",
        model: string,
        options: { dtype: "q8" }
      ) => Promise<FeatureExtractionPipeline>;
      return createPipeline("feature-extraction", LOCAL_EMBEDDING_MODEL, { dtype: "q8" });
    })();
    // Let a failed load be retried on the next call instead of failing forever.
    extractorPromise.catch(() => {
      extractorPromise = null;
    });
  }
  return extractorPromise;
}

/** Embed several texts at once. Vectors are normalized, so cosine = dot product. */
export async function generateLocalEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

export async function generateLocalEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateLocalEmbeddings([text]);
  return embedding;
}
