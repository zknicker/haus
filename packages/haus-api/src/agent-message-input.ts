import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * `haus message send` behind the loopback proxy. The runner credential fixes
 * the author and Server, so the Agent supplies the message body and grammar
 * target; the Server resolves that target and access before writing.
 */
export const agentSendInputSchema = z
    .object({
        attachmentIds: z.array(idSchema).max(20).default([]),
        /** The Trigger or Reminder fire this message answers, recorded as provenance. */
        cause: z.string().trim().min(1).max(200).optional(),
        compositionId: z.string().trim().min(1).max(200).optional(),
        content: z.string().max(32_000).optional(),
        continueAnyway: z.boolean().default(false),
        nonce: z.string().trim().min(1).max(128),
        /** The direct parent of an inline reply; the Server derives its root. */
        replyToMessageId: z.string().trim().min(1).optional(),
        sendDraft: z.boolean().default(false),
        target: z.string().trim().min(1).max(200),
    })
    .strict();

export type AgentSendInput = z.infer<typeof agentSendInputSchema>;

export const agentSendReceiptSchema = z
    .object({
        chatId: idSchema,
        idempotent: z.boolean(),
        messageId: idSchema,
        sequence: z.number().int().positive(),
        target: z.string(),
    })
    .strict();

export type AgentSendReceipt = z.infer<typeof agentSendReceiptSchema>;
