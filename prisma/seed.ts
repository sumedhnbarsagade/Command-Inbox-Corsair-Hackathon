import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding Corsair tables...");

  // Seed a test integration
  await prisma.corsairIntegration.upsert({
    where: { id: "seed-integration-1" },
    update: {},
    create: {
      id: "seed-integration-1",
      name: "gmail",
      config: { provider: "google", scopes: ["mail.read", "mail.send"] },
    },
  });

  // Seed a test account
  await prisma.corsairAccount.upsert({
    where: { id: "seed-account-1" },
    update: {},
    create: {
      id: "seed-account-1",
      tenantId: "dev",
      integrationId: "seed-integration-1",
      config: { email: "demo@example.com" },
    },
  });

  console.log("✅ Seeded 1 integration and 1 account");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
