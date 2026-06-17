import { z } from "zod";

import {
  encodeRawEmail,
  extractBodyFromPayload,
  getHeader,
} from "@/server/lib/email";
import { getTenant } from "@/server/lib/tenant";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

const paginationSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const attachmentSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1).default("application/octet-stream"),
  data: z.string().min(1),
});

const composeEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

type GmailMessageIndex = { id?: string };
type GmailListResponse = {
  messages?: GmailMessageIndex[];
  items?: GmailMessageIndex[];
};
type CorsairMessageCache = {
  create: (input: { entity_id: string; data: Record<string, unknown> }) => Promise<unknown>;
  delete?: (input: { entity_id: string }) => Promise<unknown>;
};
type GmailBatchModify = {
  batchModify?: (input: {
    userId: string;
    ids: string[];
    addLabelIds: string[];
    removeLabelIds: string[];
  }) => Promise<unknown>;
};

function isGmailMessageIndex(value: unknown): value is GmailMessageIndex {
  return (
    typeof value === "object" &&
    value !== null &&
    (!("id" in value) || typeof value.id === "string")
  );
}

function getMessageIndexes(response: unknown): GmailMessageIndex[] {
  if (Array.isArray(response)) return response.filter(isGmailMessageIndex);

  if (typeof response !== "object" || response === null) return [];

  const list = response as GmailListResponse;
  return list.messages ?? list.items ?? [];
}

function messageTimestamp(
  internalDate?: string | null,
  createdAt?: Date | null,
): number {
  if (internalDate) return Number(internalDate);
  if (createdAt) return createdAt.getTime();
  return 0;
}

function mapMessage(message: {
  entity_id: string;
  data: {
    threadId?: string;
    snippet?: string;
    subject?: string;
    from?: string;
    to?: string;
    body?: string;
    internalDate?: string;
    labelIds?: string[];
    createdAt?: Date | null;
  };
}) {
  return {
    id: message.entity_id,
    threadId: message.data.threadId ?? "",
    snippet: message.data.snippet ?? "",
    subject: message.data.subject ?? "",
    from: message.data.from ?? "",
    to: message.data.to ?? "",
    date: message.data.internalDate ?? null,
    labels: message.data.labelIds ?? [],
    timestamp: messageTimestamp(
      message.data.internalDate,
      message.data.createdAt,
    ),
  };
}

function sortMessagesNewestFirst<T extends { timestamp: number }>(
  messages: T[],
): T[] {
  return [...messages].sort((a, b) => b.timestamp - a.timestamp);
}

function dedupeByEntityId<T extends { entity_id: string; updated_at: Date }>(
  items: T[],
): T[] {
  const byEntityId = new Map<string, T>();
  for (const item of items) {
    const existing = byEntityId.get(item.entity_id);
    if (!existing || item.updated_at > existing.updated_at) {
      byEntityId.set(item.entity_id, item);
    }
  }
  return Array.from(byEntityId.values());
}

export const gmailRouter = createTRPCRouter({
  searchEmails: publicProcedure
    .input(
      paginationSchema.extend({
        query: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenant = await getTenant(ctx.userId);

      const messages = input.query.trim()
        ? await tenant.gmail.db.messages.search({
            data: {
              snippet: { contains: input.query },
            },
            limit: input.limit,
            offset: input.offset,
          })
        : await tenant.gmail.db.messages.list({
            limit: input.limit,
            offset: input.offset,
          });

      return sortMessagesNewestFirst(
        dedupeByEntityId(messages).map(mapMessage),
      );
    }),

  getMessage: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenant = await getTenant(ctx.userId);
      const cached = await tenant.gmail.db.messages.findByEntityId(input.id);

      if (cached?.data.body || cached?.data.subject) {
        return {
          id: cached.entity_id,
          threadId: cached.data.threadId ?? "",
          subject: cached.data.subject ?? "",
          from: cached.data.from ?? "",
          to: cached.data.to ?? "",
          body: cached.data.body ?? cached.data.snippet ?? "",
          snippet: cached.data.snippet ?? "",
          date: cached.data.internalDate ?? null,
          labels: cached.data.labelIds ?? [],
        };
      }

      const message = await tenant.gmail.api.messages.get({
        id: input.id,
        format: "full",
      });

      const headers = message.payload?.headers;
      const body =
        extractBodyFromPayload(message.payload) ?? message.snippet ?? "";

      return {
        id: message.id ?? input.id,
        threadId: message.threadId ?? "",
        subject: getHeader(headers, "Subject"),
        from: getHeader(headers, "From"),
        to: getHeader(headers, "To"),
        body,
        snippet: message.snippet ?? "",
        date:
          message.internalDate != null ? String(message.internalDate) : null,
        labels: message.labelIds ?? [],
      };
    }),

  listDrafts: publicProcedure
    .input(paginationSchema)
    .query(async ({ ctx, input }) => {
      const tenant = await getTenant(ctx.userId);
      const drafts = await tenant.gmail.db.drafts.list({
        limit: input.limit,
        offset: input.offset,
      });

      return dedupeByEntityId(drafts).map((draft) => ({
        id: draft.entity_id,
        messageId: draft.data.messageId ?? "",
        createdAt: draft.data.createdAt ?? null,
      }));
    }),

  refreshInbox: publicProcedure.mutation(async ({ ctx }) => {
    const tenant = await getTenant(ctx.userId);

    const response: unknown = await tenant.gmail.api.messages.list({
      userId: "me",
      maxResults: 40,
    });

    const incomingMessages = getMessageIndexes(response);
    const messageCache = tenant.gmail.db.messages as unknown as CorsairMessageCache;

    let count = 0;

    if (incomingMessages.length > 0) {
      for (const msgIndex of incomingMessages) {
        if (!msgIndex.id) continue;

        try {
          const fullMessage = await tenant.gmail.api.messages.get({
            id: msgIndex.id,
            format: "full",
          });

          const headers = fullMessage.payload?.headers;
          const subject =
            headers?.find((h) => h.name === "Subject")?.value ?? "(No Subject)";
          const from =
            headers?.find((h) => h.name === "From")?.value ?? "Unknown Sender";
          const to = headers?.find((h) => h.name === "To")?.value ?? "";
          const computedBody =
            extractBodyFromPayload(fullMessage.payload) ??
            fullMessage.snippet ??
            "";

          const labelIds = fullMessage.labelIds ?? [];
          if (labelIds.length === 0) {
            if (
              from.toLowerCase().includes("me") ||
              from.toLowerCase().includes(ctx.userId?.toLowerCase() ?? "")
            ) {
              labelIds.push("SENT");
            } else {
              labelIds.push("INBOX");
            }
          }

          // Check for existence and clean up before executing supported creations
          const existing = await tenant.gmail.db.messages.findByEntityId(fullMessage.id!);
          if (existing) {
            try {
              await messageCache.delete?.({ entity_id: fullMessage.id! });
            } catch {}
          }

          await messageCache.create({
            entity_id: fullMessage.id!,
            data: {
              threadId: fullMessage.threadId ?? "",
              snippet: fullMessage.snippet ?? "",
              subject,
              from,
              to,
              body: computedBody,
              labelIds: labelIds,
              internalDate:
                fullMessage.internalDate != null
                  ? String(fullMessage.internalDate)
                  : String(Date.now()),
              createdAt: new Date(),
            },
          });
          count++;
        } catch (error) {
          console.error(`Failed background sync processing: ${msgIndex.id}:`, error);
        }
      }
    }

    return {
      synced: count,
    };
  }),

  toggleStarMessage: publicProcedure
    .input(z.object({ id: z.string().min(1), starred: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenant = await getTenant(ctx.userId);

      try {
        // Toggle the label using the standard client api path modification
        const messagesApi = tenant.gmail.api.messages as unknown as GmailBatchModify;
        if (messagesApi.batchModify) {
          await messagesApi.batchModify({
            userId: "me",
            ids: [input.id],
            addLabelIds: input.starred ? ["STARRED"] : [],
            removeLabelIds: input.starred ? [] : ["STARRED"],
          });
        }

        const cached = await tenant.gmail.db.messages.findByEntityId(input.id);
        if (cached) {
          let updatedLabels = cached.data.labelIds ?? [];
          if (input.starred && !updatedLabels.includes("STARRED")) {
            updatedLabels.push("STARRED");
          } else if (!input.starred) {
            updatedLabels = updatedLabels.filter((l) => l !== "STARRED");
          }

          // Safely delete and recreate the object to replicate an update
          const messageCache = tenant.gmail.db.messages as unknown as CorsairMessageCache;
          try {
            await messageCache.delete?.({ entity_id: input.id });
          } catch {}

          await messageCache.create({
            entity_id: input.id,
            data: {
              ...cached.data,
              labelIds: updatedLabels,
            },
          });
        }
      } catch (error) {
        console.error("Failed to persistently toggle email star state:", error);
      }

      return { success: true };
    }),

  createDraft: publicProcedure
    .input(composeEmailSchema)
    .mutation(async ({ ctx, input }) => {
      const tenant = await getTenant(ctx.userId);
      const raw = encodeRawEmail(input);
      const draft = await tenant.gmail.api.drafts.create({
        draft: { message: { raw } },
      });
      return {
        id: draft.id ?? "",
        messageId: draft.message?.id ?? "",
      };
    }),

  sendDraft: publicProcedure
    .input(z.object({ draftId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenant = await getTenant(ctx.userId);
      const message = await tenant.gmail.api.drafts.send({ id: input.draftId });
      return {
        id: message.id ?? "",
        threadId: message.threadId ?? "",
      };
    }),

  sendEmail: publicProcedure
    .input(composeEmailSchema)
    .mutation(async ({ ctx, input }) => {
      const tenant = await getTenant(ctx.userId);
      const raw = encodeRawEmail(input);
      const message = await tenant.gmail.api.messages.send({ raw });
      return {
        id: message.id ?? "",
        threadId: message.threadId ?? "",
      };
    }),
});
