import * as z from 'zod';
import { chatMessageSchema, idSchema, threadSummarySchema } from './chat.ts';
import { claimStatuses, messageClaimSchema } from './claim-shared.ts';
import { taskPriorities } from './task-labels.ts';

export const claimListInputSchema = z
    .object({
        chatId: idSchema.optional(),
        /** Widen the lens to the background tier the Board and List hide. */
        includeBackground: z.boolean().default(false),
        serverId: idSchema,
    })
    .strict();

export const claimListItemSchema = z
    .object({
        chatKind: z.enum(['channel', 'dm']),
        chatName: z.string().nullable(),
        chatPeerUserId: idSchema.nullable(),
        claim: messageClaimSchema,
        message: chatMessageSchema,
        threadSummary: threadSummarySchema,
    })
    .strict();

/**
 * The Board and List lens. `backgroundCount` is how many background-tier claims
 * this same query hid, so the App can offer "N background" without a second
 * round trip; it is 0 whenever `includeBackground` widened the lens.
 */
export const claimListSchema = z
    .object({
        backgroundCount: z.number().int().nonnegative(),
        claims: z.array(claimListItemSchema),
    })
    .strict();

export const claimAssigneesInputSchema = z
    .object({
        messageId: idSchema,
        serverId: idSchema,
    })
    .strict();

/**
 * Who a claim may be handed to: an Agent member of the claim's Chat. Humans are
 * never assignees (ADR 0037); an Agent hands work to a human by @mentioning
 * them in the claim Thread.
 */
export const claimAssigneeSchema = z
    .object({
        agentId: idSchema,
        avatarUrl: z.string().nullable(),
        displayName: z.string(),
        handle: z.string(),
    })
    .strict();

/** The assignee a mutation names, without the presentation fields. */
export const claimAssigneeRefSchema = z.object({ agentId: idSchema }).strict();

export const claimAssigneesSchema = z.array(claimAssigneeSchema);

export const claimPromoteInputSchema = z
    .object({
        messageId: idSchema,
        serverId: idSchema,
    })
    .strict();

export const claimPromotionSchema = z
    .object({
        claim: messageClaimSchema,
        idempotent: z.boolean(),
    })
    .strict();

export const claimCreateInputSchema = z
    .object({
        chatId: idSchema,
        content: z.string().trim().min(1).max(32_000),
        nonce: z.string().trim().min(1).max(128),
        serverId: idSchema,
    })
    .strict();

export const claimMutationInputSchema = z
    .object({
        expectedVersion: z.number().int().positive(),
        messageId: idSchema,
        serverId: idSchema,
    })
    .strict();

export const claimAssignInputSchema = claimMutationInputSchema.extend({
    assignee: claimAssigneeRefSchema.nullable(),
});

export const claimUpdateInputSchema = claimMutationInputSchema.extend({
    patch: z
        .object({
            labelIds: z.array(idSchema).optional(),
            priority: z.enum(taskPriorities).optional(),
            status: z.enum(claimStatuses).optional(),
        })
        .refine((patch) => Object.keys(patch).length > 0, 'Provide at least one claim field.'),
});

export const claimMutationSchema = z
    .object({
        claim: messageClaimSchema,
    })
    .strict();

/**
 * `claim.onChanged`: a claim was created on, or changed on, its Message. Chat
 * access scoped. Ids only: the App invalidates that Message entry (`chat.message`)
 * and `claim.list`. `chatId` is the Message's Chat: for a Thread claim, its
 * Thread, not the claim's own top-level `chatId`.
 */
export const claimChangedEventSchema = z
    .object({
        chatId: idSchema,
        kind: z.enum(['created', 'updated']),
        messageId: idSchema,
        serverId: idSchema,
    })
    .strict();

export type ClaimChangedEvent = z.infer<typeof claimChangedEventSchema>;
export type ClaimList = z.infer<typeof claimListSchema>;
export type ClaimListItem = z.infer<typeof claimListItemSchema>;
export type ClaimAssignee = z.infer<typeof claimAssigneeSchema>;
