import { type NextRequest, NextResponse } from "next/server";
import { processOAuthCallback } from "corsair/oauth";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";

import { corsair, ensureCorsairConfigured } from "@/server/corsair";
import { db } from "@/server/db";
import { users, corsairAccounts } from "@/server/db/schema";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/?oauth_error=" + encodeURIComponent(error), request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 },
    );
  }

  try {
    await ensureCorsairConfigured();

    const redirectUri = new URL("/api/auth/callback", request.url).toString();

    const result = await processOAuthCallback(corsair, {
      code,
      state,
      redirectUri,
    });

    console.info(
      "OAuth callback success for:",
      result.plugin,
      "tenant:",
      result.tenantId,
    );

    let tenantEmail = result.tenantId;

    if (result.tenantId.startsWith("temp_")) {
      // 1. Fetch access token from Corsair keys manager
      const tenantClient = corsair.withTenant(result.tenantId);
      const accessToken = await tenantClient.gmail.keys.get_access_token();
      if (!accessToken) {
        throw new Error("No access token found for temporary tenant");
      }

      // 2. Fetch email address from Google Gmail Profile API
      const profileRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!profileRes.ok) {
        throw new Error(
          `Failed to fetch Gmail profile: ${await profileRes.text()}`,
        );
      }

      const profileData = (await profileRes.json()) as { emailAddress: string };
      tenantEmail = profileData.emailAddress.toLowerCase();

      // 3. Migrate the temp account row in database to use user's email
      const tempAccounts = await db
        .select()
        .from(corsairAccounts)
        .where(eq(corsairAccounts.tenantId, result.tenantId))
        .execute();

      if (tempAccounts.length > 0 && tempAccounts[0]) {
        const tempAcc = tempAccounts[0];
        // Delete any pre-existing account to avoid unique constraints violation
        await db
          .delete(corsairAccounts)
          .where(
            and(
              eq(corsairAccounts.tenantId, tenantEmail),
              eq(corsairAccounts.integrationId, tempAcc.integrationId),
            ),
          )
          .execute();

        // Rename temp account to user email
        await db
          .update(corsairAccounts)
          .set({ tenantId: tenantEmail, updatedAt: new Date() })
          .where(eq(corsairAccounts.id, tempAcc.id))
          .execute();
      }
    }

    // Look up or create user based on the resolved email
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, tenantEmail.toLowerCase()))
      .execute();

    let userId: string;
    if (existing.length === 0) {
      userId = crypto.randomUUID();
      await db
        .insert(users)
        .values({
          id: userId,
          email: tenantEmail.toLowerCase(),
          name: tenantEmail.split("@")[0] ?? "User",
          passwordHash: "oauth-only",
          salt: "oauth-only",
        })
        .execute();
    } else {
      userId = existing[0]!.id;
    }

    const response = NextResponse.redirect(
      new URL("/?connection_success=" + result.plugin, request.url),
    );

    // Write session cookie
    response.cookies.set("userId", userId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    return response;
  } catch (err) {
    console.error("Failed to process OAuth callback:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL("/?oauth_error=" + encodeURIComponent(message), request.url),
    );
  }
}
