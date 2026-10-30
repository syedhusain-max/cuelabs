/**
 * One-time starter content for CueLabs.
 *
 * Loads the public-domain (CC0) prompts bundled in prompts.csv.
 * - Runs only when the library has no prompts yet, so it never duplicates
 *   or overwrites anything people have added.
 * - Creates one "CueLabs Library" author account with NO password, so
 *   nobody can sign in as it. No admin or test accounts are created.
 */
import { PrismaClient, PromptType, StructuredFormat } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const LIBRARY_USERNAME = "cuelabs";
const LIBRARY_EMAIL = "library@cuelabs.invalid";
const BATCH_SIZE = 250;

interface CsvRow {
  act: string;
  prompt: string;
  for_devs: string;
  type: string;
}

/** Minimal RFC 4180 CSV parser (handles quoted fields, "" escapes and newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readPrompts(): CsvRow[] {
  const file = path.join(process.cwd(), "prompts.csv");
  const [header, ...lines] = parseCsv(readFileSync(file, "utf8"));
  const idx = (name: string) => header.indexOf(name);
  const iAct = idx("act");
  const iPrompt = idx("prompt");
  const iDevs = idx("for_devs");
  const iType = idx("type");
  if (iAct < 0 || iPrompt < 0) throw new Error("prompts.csv is missing act/prompt columns");

  return lines
    .map((cols) => ({
      act: (cols[iAct] ?? "").trim(),
      prompt: (cols[iPrompt] ?? "").trim(),
      for_devs: (cols[iDevs] ?? "").trim(),
      type: (cols[iType] ?? "").trim(),
    }))
    .filter((r) => r.act && r.prompt);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100);
}

function toType(raw: string): PromptType {
  if (raw === "STRUCTURED") return "STRUCTURED";
  if (raw === "IMAGE") return "IMAGE";
  return "TEXT";
}

function detectFormat(content: string): StructuredFormat {
  const first = content.trimStart()[0];
  return first === "{" || first === "[" ? "JSON" : "YAML";
}

async function main() {
  const existing = await prisma.prompt.count();
  if (existing > 0) {
    console.log(`ℹ️  Library already has ${existing} prompts — skipping starter content.`);
    return;
  }

  const rows = readPrompts();
  console.log(`🌱 Loading ${rows.length} starter prompts into CueLabs...`);

  const author = await prisma.user.upsert({
    where: { username: LIBRARY_USERNAME },
    update: {},
    create: {
      email: LIBRARY_EMAIL,
      username: LIBRARY_USERNAME,
      name: "CueLabs Library",
      password: null,
      role: "USER",
      locale: "en",
      verified: true,
    },
  });

  const general = await prisma.category.upsert({
    where: { slug: "general" },
    update: {},
    create: { name: "General", slug: "general", icon: "✨", order: 1 },
  });
  const developers = await prisma.category.upsert({
    where: { slug: "developers" },
    update: {},
    create: { name: "Developers", slug: "developers", icon: "💻", order: 2 },
  });

  const data = rows.map((r) => {
    const type = toType(r.type);
    return {
      id: randomUUID(),
      title: r.act,
      slug: slugify(r.act) || null,
      content: r.prompt,
      type,
      structuredFormat: type === "STRUCTURED" ? detectFormat(r.prompt) : null,
      authorId: author.id,
      categoryId: r.for_devs.toUpperCase() === "TRUE" ? developers.id : general.id,
    };
  });

  // One all-or-nothing transaction: a failure leaves the library empty,
  // so the next deploy simply tries again.
  const ops = [];
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    ops.push(prisma.prompt.createMany({ data: batch }));
    ops.push(
      prisma.promptVersion.createMany({
        data: batch.map((p) => ({
          promptId: p.id,
          version: 1,
          content: p.content,
          changeNote: "Initial version",
          createdBy: author.id,
        })),
      }),
    );
  }
  await prisma.$transaction(ops);
  const created = data.length;

  console.log(`✅ Loaded ${created} starter prompts.`);
}

main()
  .catch((e) => {
    console.error("❌ Starter content failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
