import * as z from 'zod';
import { agentDetailInputSchema } from './agent.ts';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

const chatlessSources: ReadonlySet<string> = new Set(['dream', 'heartbeat', 'heartbeat_report']);

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
        /** Null only for a `dream`, `heartbeat`, or `heartbeat_report`. */
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
    .refine((record) => (record.chatId === null) === chatlessSources.has(record.source), {
        message: 'Only a dream, heartbeat, or heartbeat report delivery is chatless.',
        path: ['chatId'],
    });

export type AgentDeliveryRecord = z.infer<typeof agentDeliveryRecordSchema>;

export const agentDeliveriesInputSchema = agentDetailInputSchema.extend({
    limit: z.number().int().min(1).max(100).default(50),
});

export type AgentDeliveriesInput = z.infer<typeof agentDeliveriesInputSchema>;

export const agentDeliveriesSchema = z.array(agentDeliveryRecordSchema);
