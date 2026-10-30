/**
 * Free, open-source embeddings that run inside the app (no API key, no per-use cost).
 *
 * Uses a small multilingual sentence model through Transformers.js. The model
 * files are downloaded from Hugging Face the first time they are needed and
 * cached in /tmp (the only writable folder on Vercel), so the first search on a
 * fresh server takes a few seconds; later searches are fast.
 *
 * Kept free of "@/..." imports so build scripts can use it directly.
 */
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

export const LOCAL_EMBEDDING_MODEL =
  process.env.LOCAL_EMBEDDING_MODEL || "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = process.env.LOCAL_EMBEDDING_CACHE_DIR || "/tmp/transformers-cache";
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
