import { eq } from "drizzle-orm";
import { corsair } from "@/server/corsair";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export async function getTenant(userId?: string | null) {
  let tenantId = process.env.TENANT_ID ?? "dev";

  if (userId) {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .execute();
    if (user.length > 0 && user[0]) {
      tenantId = user[0].email;
    }
  }

  return corsair.withTenant(tenantId);
}
