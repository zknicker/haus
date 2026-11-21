import * as z from 'zod';
import { agentTurnFailureKindSchema } from './agent-turn-failure.ts';
import { agentTokenUsageSchema, agentTurnStatusSchema } from './agent-turn-summary.ts';

const turnSpanDurationMsMax = 7 * 24 * 60 * 60 * 1000;
const boundedIdSchema = z.string().trim().min(1).max(128);
const epochMsSchema = z.number().finite().positive();

/**
 * One Agent turn span the runner recorded, sent once after the turn settles.
 * It carries ids, counts and timing only, never message content, prompts or
 * tool output. The Server re-exports it through its own trace pipeline; the
 * runner has no exporter and no egress beyond the Server.
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
        /** The dispatch span the Server started the run under; absent for a root turn. */
        parentSpanId: z
            .string()
            .regex(/^[0-9a-f]{16}$/u)
            .optional(),
        runId: boundedIdSchema,
        runtimeId: boundedIdSchema,
        sampled: z.boolean(),
        spanId: z.string().regex(/^[0-9a-f]{16}$/u),
        startedAtMs: epochMsSchema,
        tokenUsage: agentTokenUsageSchema.nullable(),
        traceId: z.string().regex(/^[0-9a-f]{32}$/u),
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
