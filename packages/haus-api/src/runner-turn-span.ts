import * as z from 'zod';
import { agentTurnFailureKindSchema } from './agent-turn-failure.ts';
import { agentTokenUsageSchema, agentTurnStatusSchema } from './agent-turn-summary.ts';

const turnSpanDurationMsMax = 7 * 24 * 60 * 60 * 1000;
const boundedIdSchema = z.string().trim().min(1).max(128);
const epochMsSchema = z.number().finite().positive();

/**
 * One Agent turn span the runner recorded, sent once after the turn settles.
 * It carries ids, counts and timing only, never message content, prompts or
 * tool output. It names no trace: the Server stamps the trace id, parent and
 * sampling from the dispatch context it put on the run's `runner-start`, then
 * re-exports the span through its own trace pipeline.
 */
export const runnerTurnSpanFrameSchema = z
    .object({
        agentId: boundedIdSchema,
        chatId: boundedIdSchema.optional(),
        endedAtMs: epochMsSchema,
        failureKind: agentTurnFailureKindSchema.optional(),
        messageCount: z.number().int().nonnegative().max(10_000),
        modelId: boundedIdSchema,
        outcome: agentTurnStatusSchema,
        outputProduced: z.boolean(),
        runId: boundedIdSchema,
        runtimeId: boundedIdSchema,
        /** The Server the run's `runner-start` named; the Server checks it against its dispatch. */
        serverId: boundedIdSchema,
        /** The turn span's own id, the parent of the run's MCP spans. */
        spanId: z.string().regex(/^[0-9a-f]{16}$/u),
        startedAtMs: epochMsSchema,
        tokenUsage: agentTokenUsageSchema.nullable(),
        type: z.literal('runner-turn-span'),
    })
    .strict()
    .refine(
        (span) =>
            span.endedAtMs >= span.startedAtMs &&
            span.endedAtMs - span.startedAtMs <= turnSpanDurationMsMax,
        { message: 'A turn span ends after it starts and lasts at most seven days.' }
    );

export type RunnerTurnSpanFrame = z.infer<typeof runnerTurnSpanFrameSchema>;
