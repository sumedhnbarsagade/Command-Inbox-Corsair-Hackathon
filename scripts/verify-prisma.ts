import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const userCount = await prisma.user.count();
  const postCount = await prisma.post.count();

  console.log(`✅ Connected — ${userCount} users, ${postCount} posts in database.`);

  const users = await prisma.user.findMany({
    include: { posts: { select: { title: true, published: true } } },
    take: 5,
  });

  for (const user of users) {
    console.log(`  👤 ${user.name} (${user.email}) — ${user.posts.length} posts`);
    for (const post of user.posts) {
      console.log(`     ${post.published ? "📗" : "📝"} ${post.title}`);
    }
  }
}

main()
  .catch((e) => {
    console.error("❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
