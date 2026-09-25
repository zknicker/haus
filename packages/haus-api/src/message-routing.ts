import { z } from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

export const routingBypassReasonSchema = z.enum([
    'disabled',
    'direct-message',
    'thread',
    'reply',
    'mention',
    'attachments',
    'recipient-count',
    'sole',
    'context-limit',
    'no-context',
]);
export type RoutingBypassReason = z.infer<typeof routingBypassReasonSchema>;

export const messageRoutingAuditSchema = z
    .object({
        candidateAgentIds: z.array(idSchema),
        recipientAgentIds: z.array(idSchema),
        /**
         * `kept` is a confident answer that does not narrow; `uncertain` is below
         * `threshold`. Audits before 2026-09-25 recorded both as `uncertain`.
         */
        outcome: z.enum([
            'narrow',
            'mentioned',
            'kept',
            'uncertain',
            'failure',
            'timeout',
            'invalid',
            'stale',
            'bypass',
        ]),
        bypassReason: routingBypassReasonSchema.nullable(),
        model: z.string().nullable(),
        promptVersion: z.string().nullable(),
        confidence: z.number().min(0).max(1).nullable(),
        probability: z.number().min(0).max(1).nullable(),
        choice: z.string().nullable(),
        /** Minimum Choice confidence. Audits before 2026-09-25 gated probability at 0.90 too. */
        threshold: z.number().min(0).max(1).nullable(),
        elapsedMs: z.number().int().nonnegative().nullable(),
    })
    .strict();
export type MessageRoutingAudit = z.infer<typeof messageRoutingAuditSchema>;

export const messageRoutingInputSchema = z
    .object({
        serverId: idSchema,
        messageId: idSchema,
    })
    .strict();
export const messageRoutingDebugSchema = z
    .object({
        audit: messageRoutingAuditSchema.nullable(),
        agents: z.array(z.object({ id: idSchema, displayName: z.string() }).strict()),
    })
    .strict();
export type MessageRoutingDebug = z.infer<typeof messageRoutingDebugSchema>;
