import { z } from "zod";
import { buildCorsairToolDefs } from "@corsair-dev/mcp";
import { generateText, tool } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { corsair } from "@/server/corsair";
import { env } from "@/env";

function getLanguageModel() {
  const geminiKey = env.GEMINI_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = geminiKey;
    return google("gemini-2.0-flash");
  }
  if (env.OPENAI_API_KEY) {
    return openai("gpt-4o-mini");
  }
  return null;
}

import { eq } from "drizzle-orm";
import { users } from "@/server/db/schema";

function buildMcpTools(tenantId: string) {
  const toolDefs = buildCorsairToolDefs({ corsair, tenantId });

  return Object.fromEntries(
    toolDefs.map((def) => [
      def.name,
      tool({
        description: def.description,
        inputSchema: z.object(def.shape),
        execute: async (args) => {
          const result = await def.handler(args);
          return result.content
            .filter((c) => c.type === "text")
            .map((c) => ("text" in c ? c.text : ""))
            .join("\n");
        },
      }),
    ]),
  );
}

const SYSTEM_PROMPT = `You are an intelligent AI assistant integrated into a premium email and calendar app.

You have access to Corsair MCP tools to interact with Gmail and Google Calendar on behalf of the user.

Capabilities:
- List, search, read, draft, and send emails via Gmail
- Create calendar events and send invites via Google Calendar
- Run scripts against the Corsair API using run_script when needed

Guidelines:
- Be concise and action-oriented
- When the user asks to send an email or create an event, use the appropriate tools
- Confirm what you did after executing actions
- If a tool fails, explain the error clearly`;

export const agentRouter = createTRPCRouter({
  chat: publicProcedure
    .input(
      z.object({
        message: z.string().min(1),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = getLanguageModel();

      if (!model) {
        return {
          reply:
            "Add GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) or OPENAI_API_KEY to your .env file to enable AI chat. Corsair tools require an LLM to orchestrate actions.",
          actionPerformed: null,
          toolCalls: [] as string[],
        };
      }

      try {
        let tenantId = env.TENANT_ID ?? "dev";
        if (ctx.userId) {
          const user = await ctx.db
            .select()
            .from(users)
            .where(eq(users.id, ctx.userId))
            .execute();
          if (user.length > 0 && user[0]) {
            tenantId = user[0].email;
          }
        }
        const tools = buildMcpTools(tenantId);
        const messages = [
          ...input.history.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          { role: "user" as const, content: input.message },
        ];

        const result = await generateText({
          model,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          stopWhen: ({ steps }) => steps.length >= 8,
        });

        const toolCalls = result.steps.flatMap((step) =>
          step.toolCalls.map((tc) => tc.toolName),
        );

        return {
          reply: result.text || "Done.",
          actionPerformed: toolCalls.length > 0 ? toolCalls.join(", ") : null,
          toolCalls,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          reply: `Something went wrong: ${message}. Check your API key and Corsair auth (pnpm corsair auth).`,
          actionPerformed: null,
          toolCalls: [] as string[],
        };
      }
    }),

  prioritizeEmail: publicProcedure
    .input(
      z.object({
        subject: z.string(),
        snippet: z.string(),
        from: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const model = getLanguageModel();
      const text = `${input.subject} ${input.snippet} ${input.from ?? ""}`.toLowerCase();

      if (!model) {
        if (
          text.includes("urgent") ||
          text.includes("asap") ||
          text.includes("important")
        ) {
          return { priority: "high" as const };
        }
        if (text.includes("newsletter") || text.includes("unsubscribe")) {
          return { priority: "low" as const };
        }
        return { priority: "medium" as const };
      }

      try {
        const { text: priority } = await generateText({
          model,
          prompt: `Classify this email priority as exactly one word: High, Medium, or Low.

Subject: ${input.subject}
From: ${input.from ?? "unknown"}
Preview: ${input.snippet}

Reply with only: High, Medium, or Low`,
        });

        const normalized = priority.trim().toLowerCase();
        if (normalized.includes("high")) return { priority: "high" as const };
        if (normalized.includes("low")) return { priority: "low" as const };
        return { priority: "medium" as const };
      } catch {
        return { priority: "medium" as const };
      }
    }),
});
