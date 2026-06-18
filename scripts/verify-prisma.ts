import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const integrationCount = await prisma.corsairIntegration.count();
  const accountCount = await prisma.corsairAccount.count();
  const entityCount = await prisma.corsairEntity.count();
  const eventCount = await prisma.corsairEvent.count();

  console.log(`✅ Connected to Prisma Postgres`);
  console.log(`   ${integrationCount} integrations`);
  console.log(`   ${accountCount} accounts`);
  console.log(`   ${entityCount} entities`);
  console.log(`   ${eventCount} events`);
}

main()
  .catch((e) => {
    console.error("❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
