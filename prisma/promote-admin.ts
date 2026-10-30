// Gives one GitHub user the ADMIN role, and removes the admin role from the
// placeholder account the seed creates (admin@prompts.chat).
// Run by scripts/vercel-build.sh when ADMIN_USERNAME is set.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  if (!username) return;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.warn(`⚠️  ADMIN_USERNAME "${username}" not found. Log in once with GitHub, then redeploy.`);
  } else if (user.role !== "ADMIN") {
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    console.log(`✅ ${username} is now an admin`);
  } else {
    console.log(`✅ ${username} is already an admin`);
  }

  // The seed's placeholder admin has a known password; keep it as a normal user.
  const placeholder = await prisma.user.updateMany({
    where: { email: "admin@prompts.chat", role: "ADMIN" },
    data: { role: "USER" },
  });
  if (placeholder.count > 0) console.log("🔒 Removed admin role from admin@prompts.chat");
}

main()
  .catch((error) => {
    console.error("promote-admin failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
