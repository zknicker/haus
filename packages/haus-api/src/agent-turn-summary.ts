import * as z from 'zod';
import { agentTurnActivitySummarySchema } from './agent-activity.ts';
import {
    agentTurnFailureCodeSchema,
    agentTurnFailureFingerprintSchema,
    agentTurnFailureKindSchema,
} from './agent-turn-failure.ts';
import { agentTurnRejectedItemSchema } from './agent-turn-rejected-item.ts';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * The compact turn summary a Computer pushes after a launch settles. Durable
 * collaboration and this compact activity live Server-side; the raw transcript,
 * logs, and workspace stay Computer-local behind the authorized live relay.
 */
export const agentTurnStatusSchema = z.enum(['completed', 'failed', 'interrupted']);
export const agentTokenUsageSchema = z
    .object({
        cacheReadTokens: z.number().int().nonnegative(),
        cacheWriteTokens: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
    })
    .strict();

export const agentTurnSummarySchema = z
    .object({
        /** Older settled Computer run markers replay with an empty aggregate. */
        activity: agentTurnActivitySummarySchema.default({ operations: [] }),
        agentId: idSchema,
        endedAt: timestampSchema,
        failureCode: agentTurnFailureCodeSchema.optional(),
        failureFingerprint: agentTurnFailureFingerprintSchema.optional(),
        failureKind: agentTurnFailureKindSchema.optional(),
        messageCount: z.number().int().nonnegative().max(10_000),
        modelId: z.string().trim().min(1),
        /**
         * Whether the turn produced model-visible output (any durable send).
         * A failed turn that produced output must not have its work requeued —
         * doing so would re-trigger the output. Acceptance alone never sets
         * this flag; an accepted crash replays at least once.
         */
        outputProduced: z.boolean(),
        /** Inbox items a rejected start could not accept, so the retry leaves them out. */
        rejectedItems: z.array(agentTurnRejectedItemSchema).max(100).optional(),
        runId: idSchema,
        runtimeId: z.string().trim().min(1),
        startedAt: timestampSchema,
        status: agentTurnStatusSchema,
        summary: z.string().max(2000),
        tokenUsage: agentTokenUsageSchema.nullable(),
        type: z.literal('turn'),
        visibleMessages: z
            .array(
                z.object({
                    chatId: idSchema,
                    id: idSchema,
                    sequence: z.number().int().positive(),
                })
            )
            .max(10_000)
            .default([]),
    })
    .strict();

export type AgentTurnSummary = z.infer<typeof agentTurnSummarySchema>;
export type AgentTokenUsage = z.infer<typeof agentTokenUsageSchema>;
