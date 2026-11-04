import * as z from 'zod';
import { agentDetailInputSchema } from './agent.ts';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/**
 * Inbox sources with no Chat: the nightly dream, a daytime heartbeat, a heartbeat's
 * report to the main session, the sub-agent wake, and a board Task assigned to the
 * Agent (ADR 0051). Each leads its own chatless run (specs/heartbeat.md), and the
 * Server schema's chat checks name exactly these sources.
 */
export const chatlessInboxSources = [
    'dream',
    'heartbeat',
    'heartbeat_report',
    'subagent',
    'task_assignment',
] as const;

export function isChatlessInboxSource(source: string): boolean {
    return (chatlessInboxSources as readonly string[]).includes(source);
}

/**
 * One durable delivery of one unit of work to one Agent. `seen` rows are
 * retained after settlement with the `turnId` that consumed them, so an
 * observer can tell "the Agent never received it" from "the Agent received it
 * and said nothing".
 */
export const agentDeliveryRecordSchema = z
    .object({
        acceptedAt: timestampSchema.nullable(),
        agentId: idSchema,
        /** Null only for a chatless source (`chatlessInboxSources`). */
        chatId: idSchema.nullable(),
        createdAt: timestampSchema,
        /** Null for typed work that carries no Chat message. */
        messageId: z.string().trim().min(1).max(128).nullable(),
        source: z.string().trim().min(1).max(64),
        seenAt: timestampSchema.nullable(),
        servedAt: timestampSchema.nullable(),
        state: z.enum(['queued', 'accepted', 'served', 'seen']),
        turnId: z.string().trim().min(1).max(128).nullable(),
        workId: idSchema,
    })
    .strict()
    .refine((record) => (record.chatId === null) === isChatlessInboxSource(record.source), {
        message:
            'Only a dream, heartbeat, heartbeat report, sub-agent wake, or task assignment delivery is chatless.',
        path: ['chatId'],
    });

export type AgentDeliveryRecord = z.infer<typeof agentDeliveryRecordSchema>;

export const agentDeliveriesInputSchema = agentDetailInputSchema.extend({
    limit: z.number().int().min(1).max(100).default(50),
});

export type AgentDeliveriesInput = z.infer<typeof agentDeliveriesInputSchema>;

export const agentDeliveriesSchema = z.array(agentDeliveryRecordSchema);
