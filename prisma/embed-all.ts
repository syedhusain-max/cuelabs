// Creates search "fingerprints" (embeddings) for every public prompt that lacks one,
// using the free open-source search model. Run by scripts/vercel-build.sh when EMBED_ON_BUILD=true.
// Set EMBED_REGENERATE=true to redo all of them (e.g. after changing the model).
import { Prisma, PrismaClient } from "@prisma/client";
import { generateLocalEmbeddings, LOCAL_EMBEDDING_MODEL } from "./local-embeddings";
import { promptTextForEmbedding } from "../src/lib/ai/search-vector";

const prisma = new PrismaClient();
const BATCH_SIZE = 32;

async function main() {
  if (process.env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY is set, so search uses OpenAI. Use the admin page to generate embeddings instead.");
    return;
  }

  const regenerate = process.env.EMBED_REGENERATE === "true";
  const prompts = await prisma.prompt.findMany({
    where: {
      isPrivate: false,
      deletedAt: null,
      ...(regenerate ? {} : { embedding: { equals: Prisma.DbNull } }),
    },
    select: { id: true, title: true, description: true, content: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`🧠 Creating search fingerprints for ${prompts.length} prompts with ${LOCAL_EMBEDDING_MODEL}...`);
  let done = 0;
  let failed = 0;

  for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
    const batch = prompts.slice(i, i + BATCH_SIZE);
    const texts = batch.map(promptTextForEmbedding);
    try {
      const vectors = await generateLocalEmbeddings(texts);
      await prisma.$transaction(
        batch.map((p, j) => prisma.prompt.update({ where: { id: p.id }, data: { embedding: vectors[j] } }))
      );
      done += batch.length;
    } catch (error) {
      failed += batch.length;
      console.error(`Batch starting at ${i} failed:`, error);
    }
    if ((i / BATCH_SIZE) % 10 === 0 || i + BATCH_SIZE >= prompts.length) {
      console.log(`   ${done + failed}/${prompts.length} (failed: ${failed})`);
    }
  }

  console.log(`✅ Fingerprints done: ${done} created, ${failed} failed`);
}

main()
  .catch((error) => {
    // Don't block the site from deploying if this optional step fails.
    console.error("embed-all failed:", error);
  })
  .finally(() => prisma.$disconnect());
