import { channelColorSchema, channelIconSchema } from './channel-appearance.ts';
import { channelDescriptionSchema, channelEditInputFields } from './channel-description.ts';
import { chatMessageAuthorSchema, chatMessageReplySchema } from './chat-message-context.ts';

export * from './channel-appearance.ts';

import { messageBodySchema } from './message-body.ts';

export * from './message-body.ts';

import * as z from 'zod';
import { attachmentMetadataSchema } from './attachments.ts';
import { messageCauseSchema } from './automation.ts';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { chatLastMessageSchema } from './chat-last-message.ts';
import * as reactionContracts from './chat-message-reactions.ts';
import * as receiptContracts from './chat-message-receipts.ts';
import { messageTaskSchema } from './task-shared.ts';

export { idSchema } from './chat-contract-primitives.ts';
export * from './chat-message-context.ts';
export * from './chat-message-reactions.ts';
export const chatMessageSchema = z
    .object({
        attachments: z.array(attachmentMetadataSchema).default([]),
        author: chatMessageAuthorSchema,
        body: messageBodySchema,
        /** Why an Agent wrote this: the Trigger or Reminder fire it answered. */
        cause: messageCauseSchema.optional(),
        chatId: idSchema,
        content: z.string().max(32_000),
        createdAt: timestampSchema,
        id: idSchema,
        nonce: z.string().trim().min(1).max(128),
        reactions: z.array(reactionContracts.chatMessageReactionSchema).default([]),
        /** Bounded direct-parent and chain-root context for an inline reply. */
        reply: chatMessageReplySchema.nullable().default(null),
        /** The real Server-assigned Agent run; human messages are null. */
        runId: idSchema.nullable(),
        sequence: z.number().int().positive(),
        /**
         * The Agent session generation that wrote this message, as execution
         * lineage; human messages carry null.
         */
        sessionGeneration: z.number().int().positive().nullable().default(null),
        serverId: idSchema,
        task: messageTaskSchema.nullable().optional(),
    })
    .strict();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * One reply as the anchor's Thread preview quotes it. Authors stay as ids so
 * every surface names them through the Agent list and member directory.
 */
export const threadReplyPreviewSchema = z
    .object({
        authorAgentId: idSchema.nullable(),
        authorUserId: idSchema.nullable(),
        content: z.string(),
        createdAt: timestampSchema,
        id: idSchema,
    })
    .strict();

export type ThreadReplyPreview = z.infer<typeof threadReplyPreviewSchema>;

export const threadSummarySchema = z
    .object({
        anchorMessageId: idSchema,
        followed: z.boolean(),
        latestReplyAt: timestampSchema.nullable(),
        // The newest replies, oldest first, for the anchor's preview block.
        recentReplies: z.array(threadReplyPreviewSchema),
        replyCount: z.number().int().nonnegative(),
        threadChatId: idSchema,
        unreadCount: z.number().int().nonnegative(),
    })
    .strict();

export type ThreadSummary = z.infer<typeof threadSummarySchema>;

const chatSendBaseSchema = z
    .object({
        attachmentIds: z.array(idSchema).default([]),
        content: z.string().trim().max(32_000),
        nonce: z.string().trim().min(1).max(128),
        /** The direct parent of an inline reply; the Server derives its root. */
        replyToMessageId: idSchema.optional(),
        serverId: idSchema,
    })
    .strict();

export const chatSendInputSchema = z
    .union([
        chatSendBaseSchema.extend({
            chatId: idSchema,
            thread: z.object({ anchorMessageId: idSchema }).strict().optional(),
        }),
        chatSendBaseSchema.extend({
            agentId: idSchema,
            targetKind: z.literal('agent-dm'),
        }),
    ])
    .superRefine((input, context) => {
        if (input.content.length === 0 && input.attachmentIds.length === 0) {
            context.addIssue({
                code: 'custom',
                message: 'A Server message needs text or an attachment.',
                path: ['content'],
            });
        }

        if (new Set(input.attachmentIds).size !== input.attachmentIds.length) {
            context.addIssue({
                code: 'custom',
                message: 'Attachment ids must be unique.',
                path: ['attachmentIds'],
            });
        }
    });

export type ChatSendInput = z.infer<typeof chatSendInputSchema>;

export const chatSchema = z
    .object({
        archivedAt: timestampSchema.nullable(),
        archivedByUserId: idSchema.nullable(),
        color: channelColorSchema.nullable(),
        createdAt: timestampSchema,
        description: channelDescriptionSchema.nullable(),
        icon: channelIconSchema.nullable(),
        id: idSchema,
        isAll: z.boolean(),
        kind: z.enum(['channel', 'dm']),
        lastActivityAt: timestampSchema.nullable(),
        lastMessage: chatLastMessageSchema.nullable(),
        lastMessageSequence: z.number().int().nonnegative(),
        name: z.string().min(1).nullable(),
        participantAgentIds: z.array(idSchema),
        participantUserIds: z.array(idSchema),
        peerAgentDisplayName: z.string().min(1).nullable(),
        peerAgentId: idSchema.nullable(),
        peerAgentRetired: z.boolean(),
        peerUserId: idSchema.nullable(),
        serverId: idSchema,
        unreadCount: z.number().int().nonnegative(),
    })
    .strict();

export type Chat = z.infer<typeof chatSchema>;

export const chatGetInputSchema = z.object({ chatId: idSchema, serverId: idSchema }).strict();

export const channelCreateInputSchema = z
    .object({
        ...channelEditInputFields,
        agentIds: z.array(idSchema).min(1),
        name: z
            .string()
            .trim()
            .min(1)
            .max(32)
            .regex(/^[A-Za-z0-9_-]+$/u),
        serverId: idSchema,
    })
    .strict()
    .superRefine((input, context) => {
        if (new Set(input.agentIds).size !== input.agentIds.length) {
            context.addIssue({
                code: 'custom',
                message: 'Channel agents must be unique.',
                path: ['agentIds'],
            });
        }
    });

export type ChannelCreateInput = z.infer<typeof channelCreateInputSchema>;

export const channelUpdateInputSchema = z
    .object({
        ...channelEditInputFields,
        agentIds: z.array(idSchema).min(1),
        chatId: idSchema,
        name: z
            .string()
            .trim()
            .min(1)
            .max(32)
            .regex(/^[A-Za-z0-9_-]+$/u),
        serverId: idSchema,
    })
    .strict()
    .superRefine((input, context) => {
        if (new Set(input.agentIds).size !== input.agentIds.length) {
            context.addIssue({
                code: 'custom',
                message: 'Agent ids must be unique.',
                path: ['agentIds'],
            });
        }
    });

export type ChannelUpdateInput = z.infer<typeof channelUpdateInputSchema>;

export const channelLifecycleInputSchema = z
    .object({ chatId: idSchema, serverId: idSchema })
    .strict();

export const channelLifecycleReceiptSchema = z
    .object({
        archivedAt: timestampSchema.nullable(),
        chatId: idSchema,
        serverId: idSchema,
    })
    .strict();

export type ChannelLifecycleReceipt = z.infer<typeof channelLifecycleReceiptSchema>;

export const channelDeleteInputSchema = channelLifecycleInputSchema
    .extend({ confirmation: z.string().trim().min(1).max(32) })
    .strict();

export const channelDeleteReceiptSchema = z
    .object({ chatId: idSchema, serverId: idSchema })
    .strict();

export type ChannelDeleteReceipt = z.infer<typeof channelDeleteReceiptSchema>;

export const ensureDmInputSchema = z
    .object({
        peerUserId: idSchema,
        serverId: idSchema,
    })
    .strict();

export const ensureAgentDmInputSchema = z
    .object({
        agentId: idSchema,
        serverId: idSchema,
    })
    .strict();

export const chatListInputSchema = z.object({ serverId: idSchema }).strict();

export const chatListSchema = z.array(chatSchema);

const messageReceipts = receiptContracts.createChatMessageReceipts(chatMessageSchema);

export const chatMessageReceiptSchema = messageReceipts.message;
export type ChatMessageReceipt = z.infer<typeof chatMessageReceiptSchema>;
export const chatMessageReactionReceiptSchema = messageReceipts.reaction;
export type ChatMessageReactionReceipt = z.infer<typeof chatMessageReactionReceiptSchema>;

/**
 * Cursor selectors stay in the browser-safe chat contract entrypoint.
 * Their implementation lives separately to keep this shared module small.
 */
export {
    type ChatMessagesInput,
    chatMessagesInputSchema,
} from './chat-messages-input.ts';

export const chatMessagePageSchema = z
    .object({
        messages: z.array(chatMessageSchema),
        nextBeforeSequence: z.number().int().positive().nullable(),
        nextAfterSequence: z.number().int().nonnegative().nullable(),
        /**
         * The highest Chat sequence this read examined. A filtered read
         * (`replyRootMessageId`) can scan past its last match; the next tail read
         * starts here instead of rescanning (specs/realtime-events.md).
         */
        scannedThroughSequence: z.number().int().nonnegative(),
        threads: z.array(threadSummarySchema),
    })
    .strict();

export const threadFollowInputSchema = z
    .object({
        follow: z.boolean(),
        serverId: idSchema,
        threadChatId: idSchema,
    })
    .strict();

export const threadContextInputSchema = z
    .object({
        serverId: idSchema,
        threadChatId: idSchema,
    })
    .strict();

export const threadContextSchema = z
    .object({
        anchorMessageId: idSchema,
        parentChatId: idSchema,
        serverId: idSchema,
        threadChatId: idSchema,
    })
    .strict();

export const threadFollowReceiptSchema = z
    .object({
        followed: z.boolean(),
        serverId: idSchema,
        threadChatId: idSchema,
    })
    .strict();

export const chatSearchInputSchema = z
    .object({
        /** Only messages created at or after this instant. */
        after: timestampSchema.optional(),
        authorAgentId: idSchema.optional(),
        authorUserId: idSchema.optional(),
        chatId: idSchema.optional(),
        limit: z.number().int().min(1).max(100).default(50),
        query: z.string().trim().min(1).max(500),
        serverId: idSchema,
    })
    .strict();

export const chatSearchResultSchema = chatMessageSchema.extend({
    chatArchivedAt: timestampSchema.nullable(),
});

export type ChatSearchResult = z.infer<typeof chatSearchResultSchema>;

export const chatSearchResultsSchema = z.array(chatSearchResultSchema);

export const compositionPublishInputSchema = z
    .object({
        chatId: idSchema,
        compositionId: idSchema,
        serverId: idSchema,
        text: z.string().max(2000).nullable(),
    })
    .strict();

export const compositionSubscriptionInputSchema = z
    .object({ chatId: idSchema, serverId: idSchema })
    .strict();

export const compositionEventSchema = z
    .object({
        actorUserId: idSchema,
        chatId: idSchema,
        compositionId: idSchema,
        emittedAt: timestampSchema,
        serverId: idSchema,
        text: z.string().max(2000).nullable(),
    })
    .strict();

export type CompositionEvent = z.infer<typeof compositionEventSchema>;

export const compositionPublishedSchema = z.object({ accepted: z.literal(true) }).strict();
