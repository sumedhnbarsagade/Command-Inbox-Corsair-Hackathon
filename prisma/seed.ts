import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Upsert users
  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: {
      email: "alice@example.com",
      name: "Alice Johnson",
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: {
      email: "bob@example.com",
      name: "Bob Smith",
    },
  });

  // Create posts for Alice
  await prisma.post.upsert({
    where: { id: "seed-post-1" },
    update: {},
    create: {
      id: "seed-post-1",
      title: "Getting Started with Prisma",
      content:
        "Prisma makes database access easy with its type-safe query builder.",
      published: true,
      authorId: alice.id,
    },
  });

  await prisma.post.upsert({
    where: { id: "seed-post-2" },
    update: {},
    create: {
      id: "seed-post-2",
      title: "Prisma Postgres Tips",
      content: "Prisma Postgres scales to zero and includes a generous free tier.",
      published: true,
      authorId: alice.id,
    },
  });

  // Create a draft post for Bob
  await prisma.post.upsert({
    where: { id: "seed-post-3" },
    update: {},
    create: {
      id: "seed-post-3",
      title: "Draft: My First Post",
      content: "This is a work in progress.",
      published: false,
      authorId: bob.id,
    },
  });

  console.log("✅ Seeded 2 users and 3 posts");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
