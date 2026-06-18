import { type NextRequest, NextResponse } from "next/server";
import { processOAuthCallback } from "corsair/oauth";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";

import { corsair, ensureCorsairConfigured } from "@/server/corsair";
import { db } from "@/server/db";
import {
  users,
  corsairAccounts,
  corsairEntities,
  corsairEvents,
} from "@/server/db/schema";

async function deleteAccountCascade(accountId: string) {
  await db
    .delete(corsairEntities)
    .where(eq(corsairEntities.accountId, accountId))
    .execute();
  await db
    .delete(corsairEvents)
    .where(eq(corsairEvents.accountId, accountId))
    .execute();
  await db
    .delete(corsairAccounts)
    .where(eq(corsairAccounts.id, accountId))
    .execute();
}

async function migrateTempTenantToEmail(tempTenantId: string, tenantEmail: string) {
  const tempClient = corsair.withTenant(tempTenantId);
  const emailClient = corsair.withTenant(tenantEmail);

  // Capture OAuth tokens from temp tenant before DB migration
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  try {
    accessToken = await tempClient.gmail.keys.get_access_token();
    refreshToken = await tempClient.gmail.keys.get_refresh_token();
  } catch {
    // Keys may not exist yet for all plugins
  }

  const tempAccounts = await db
    .select()
    .from(corsairAccounts)
    .where(eq(corsairAccounts.tenantId, tempTenantId))
    .execute();

  for (const tempAcc of tempAccounts) {
    const existingForEmail = await db
      .select()
      .from(corsairAccounts)
      .where(
        and(
          eq(corsairAccounts.tenantId, tenantEmail),
          eq(corsairAccounts.integrationId, tempAcc.integrationId),
        ),
      )
      .execute();

    for (const existingAcc of existingForEmail) {
      await deleteAccountCascade(existingAcc.id);
    }

    await db
      .update(corsairAccounts)
      .set({ tenantId: tenantEmail, updatedAt: new Date() })
      .where(eq(corsairAccounts.id, tempAcc.id))
      .execute();
  }

  // Re-apply tokens on the real email tenant (keys are stored per tenantId)
  if (accessToken) {
    await emailClient.gmail.keys.set_access_token(accessToken);
  }
  if (refreshToken) {
    await emailClient.gmail.keys.set_refresh_token(refreshToken);
  }
}

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
    const isLoginFlow = result.tenantId.startsWith("temp_");

    if (isLoginFlow) {
      const tempClient = corsair.withTenant(result.tenantId);
      const accessToken = await tempClient.gmail.keys.get_access_token();
      if (!accessToken) {
        throw new Error("No access token found for temporary tenant");
      }

      const profileRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!profileRes.ok) {
        throw new Error(
          `Failed to fetch Gmail profile: ${await profileRes.text()}`,
        );
      }

      const profileData = (await profileRes.json()) as { emailAddress: string };
      tenantEmail = profileData.emailAddress.toLowerCase();

      await migrateTempTenantToEmail(result.tenantId, tenantEmail);
    }

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
      isLoginFlow
        ? new URL("/?login_success=1", request.url)
        : new URL("/?connection_success=" + result.plugin, request.url),
    );

    response.cookies.set("userId", userId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
      httpOnly: false,
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
