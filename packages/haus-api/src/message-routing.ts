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
    'context-limit',
    'no-context',
]);
export type RoutingBypassReason = z.infer<typeof routingBypassReasonSchema>;

export const messageRoutingAuditSchema = z
    .object({
        candidateAgentIds: z.array(idSchema),
        recipientAgentIds: z.array(idSchema),
        outcome: z.enum([
            'narrow',
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
