import { channelColorSchema, channelIconSchema } from './channel-appearance.ts';
import { channelDescriptionSchema } from './channel-description.ts';
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
import { messageClaimSchema } from './claim-shared.ts';
import { driveCitationSchema } from './drive.ts';
import { imageGenerationSchema } from './image-generation.ts';
import { taskDeliveryModeSchema } from './task-delivery.ts';
import { taskPreviewSchema } from './task-preview.ts';
import { taskLinkSchema } from './task-short-id.ts';

/** The most text an author may write into one Message. */
export const chatMessageAuthoredContentMaxLength = 32_000;

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
        claim: messageClaimSchema.nullable().optional(),
        content: z.string().max(chatMessageAuthoredContentMaxLength),
        createdAt: timestampSchema,
        /** Drive files the Message cites, in link order, each bound to a revision. */
        driveCitations: z.array(driveCitationSchema).default([]),
        id: idSchema,
        /**
         * The image generations this Message links, in link order. Each entry
         * is visible to the viewer; the image card renders from here.
         */
        imageGenerations: z.array(imageGenerationSchema).default([]),
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
        taskLinks: z.array(taskLinkSchema).default([]),
    })
    .strict();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export { type TaskReplyPreview, taskReplyPreviewSchema } from './task-reply-preview.ts';

const chatSendBaseSchema = z
    .object({
        attachmentIds: z.array(idSchema).default([]),
        content: z.string().trim().max(chatMessageAuthoredContentMaxLength),
        /** How the message reaches a Task's agent; only a Task chat reads it (ADR 0062). */
        delivery: taskDeliveryModeSchema.default('steer'),
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
        }),
        chatSendBaseSchema.extend({
            agentId: idSchema,
            targetKind: z.literal('captain'),
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
        /** The reader's flags on a Captain chat; null for every other kind. */
        captainChat: z.object({ member: z.boolean(), subscribed: z.boolean() }).strict().nullable(),
        color: channelColorSchema.nullable(),
        createdAt: timestampSchema,
        description: channelDescriptionSchema.nullable(),
        icon: channelIconSchema.nullable(),
        id: idSchema,
        isAll: z.boolean(),
        kind: z.enum(['channel', 'dm', 'captain']),
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

export const ensureDmInputSchema = z
    .object({
        peerUserId: idSchema,
        serverId: idSchema,
    })
    .strict();

/**
 * `chat.setCaptainChatMembership`: join or leave a Captain chat, or subscribe or unsubscribe.
 * Leaving unsubscribes; subscribing joins.
 */
export const captainChatMembershipInputSchema = z
    .object({
        chatId: idSchema,
        member: z.boolean().optional(),
        serverId: idSchema,
        subscribed: z.boolean().optional(),
    })
    .strict()
    .refine((input) => input.member !== undefined || input.subscribed !== undefined, {
        message: 'Set member or subscribed.',
        path: ['member'],
    });

export type CaptainChatMembershipInput = z.infer<typeof captainChatMembershipInputSchema>;

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
export { type ChatMessagesInput, chatMessagesInputSchema } from './chat-messages-input.ts';

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
        tasks: z.array(taskPreviewSchema).default([]),
    })
    .strict();

export * from './chat-channel-lifecycle.ts';
export * from './chat-composition.ts';
