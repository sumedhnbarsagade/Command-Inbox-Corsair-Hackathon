import { z } from "zod";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { setupCorsair } from "corsair/setup";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { users, corsairIntegrations, corsairAccounts } from "@/server/db/schema";
import { corsair } from "@/server/corsair";

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export const authRouter = createTRPCRouter({
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .execute();

      if (existing.length > 0) {
        throw new Error("User with this email already exists");
      }

      const salt = generateSalt();
      const passwordHash = hashPassword(input.password, salt);
      const id = crypto.randomUUID();

      await ctx.db
        .insert(users)
        .values({
          id,
          email: input.email.toLowerCase(),
          name: input.name,
          passwordHash,
          salt,
        })
        .execute();

      return {
        success: true,
        userId: id,
        email: input.email.toLowerCase(),
        name: input.name,
      };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const found = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .execute();

      if (found.length === 0 || !found[0]) {
        throw new Error("Invalid email or password");
      }

      const user = found[0];
      const hash = hashPassword(input.password, user.salt);

      if (hash !== user.passwordHash) {
        throw new Error("Invalid email or password");
      }

      return {
        success: true,
        userId: user.id,
        email: user.email,
        name: user.name,
      };
    }),

  getMe: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) {
      return { user: null };
    }

    const found = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, ctx.userId))
      .execute();

    if (found.length === 0 || !found[0]) {
      return { user: null };
    }

    const user = found[0];
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }),

  configureGoogleOAuth: publicProcedure
    .input(
      z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await setupCorsair(corsair, {
        credentials: {
          gmail: {
            client_id: input.clientId,
            client_secret: input.clientSecret,
          },
          googlecalendar: {
            client_id: input.clientId,
            client_secret: input.clientSecret,
          },
        },
      });

      return { success: true };
    }),

  getGoogleOAuthStatus: publicProcedure.query(async ({ ctx }) => {
    const integrations = await ctx.db
      .select()
      .from(corsairIntegrations)
      .execute();

    const hasGmailConfig = integrations.some((i) => i.name === "gmail");
    const hasCalendarConfig = integrations.some((i) => i.name === "googlecalendar");

    let gmailConnected = false;
    let calendarConnected = false;

    if (ctx.userId) {
      const user = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, ctx.userId))
        .execute();

      if (user.length > 0 && user[0]) {
        const userEmail = user[0].email;
        const accounts = await ctx.db
          .select()
          .from(corsairAccounts)
          .where(eq(corsairAccounts.tenantId, userEmail))
          .execute();

        const gmailIntegration = integrations.find((i) => i.name === "gmail");
        const calendarIntegration = integrations.find(
          (i) => i.name === "googlecalendar",
        );

        if (gmailIntegration) {
          gmailConnected = accounts.some(
            (a) => a.integrationId === gmailIntegration.id,
          );
        }
        if (calendarIntegration) {
          calendarConnected = accounts.some(
            (a) => a.integrationId === calendarIntegration.id,
          );
        }
      }
    }

    return {
      isConfigured: hasGmailConfig && hasCalendarConfig,
      gmailConnected,
      calendarConnected,
    };
  }),

  getGoogleOAuthUrl: publicProcedure
    .input(
      z.object({
        pluginId: z.enum(["gmail", "googlecalendar"]),
        redirectUri: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) {
        throw new Error("Unauthorized");
      }

      const user = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, ctx.userId))
        .execute();

      if (user.length === 0 || !user[0]) {
        throw new Error("User not found");
      }

      const tenantId = user[0].email;
      const { generateOAuthUrl } = await import("corsair/oauth");
      const { url } = await generateOAuthUrl(corsair, input.pluginId, {
        tenantId,
        redirectUri: input.redirectUri,
      });

      return { url };
    }),

  getGoogleOAuthLoginUrl: publicProcedure
    .input(
      z.object({
        redirectUri: z.string().url(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const tempId = `temp_${crypto.randomUUID()}`;
        const { generateOAuthUrl } = await import("corsair/oauth");
        const { url } = await generateOAuthUrl(corsair, "gmail", {
          tenantId: tempId,
          redirectUri: input.redirectUri,
        });
        return { url, error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          url: null,
          error: msg.includes("client_id not configured")
            ? "Google OAuth Credentials are not configured. Please sign up or log in using credentials first, then add them in the OAuth Settings panel."
            : msg,
        };
      }
    }),
});
