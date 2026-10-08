import * as z from 'zod';
import { agentDetailInputSchema } from './agent.ts';
import { agentTurnActivitySummarySchema } from './agent-activity.ts';
import { agentTurnTriggerSchema } from './agent-turn-trigger.ts';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * One settled Agent turn. `outputProduced` and `failureKind` are what make a
 * silent turn readable: a completed turn with no output and no messages is
 * positive proof the Agent chose to stay quiet, not evidence of a lost run.
 */
export const agentTurnSchema = z
    .object({
        activity: agentTurnActivitySummarySchema,
        agentId: idSchema,
        endedAt: timestampSchema,
        failureKind: z.string().trim().min(1).max(64).nullable(),
        messageCount: z.number().int().nonnegative(),
        outputProduced: z.boolean(),
        runId: idSchema,
        startedAt: timestampSchema,
        status: z.enum(['completed', 'failed', 'interrupted']),
        summary: z.string().max(2000).nullable(),
        /** What woke the turn; null when the Server recorded none (older turns). */
        trigger: agentTurnTriggerSchema.nullable(),
    })
    .strict();

export type AgentTurn = z.infer<typeof agentTurnSchema>;

export const agentTurnsInputSchema = agentDetailInputSchema.extend({
    limit: z.number().int().min(1).max(50).default(10),
    runId: idSchema.optional(),
});

export type AgentTurnsInput = z.infer<typeof agentTurnsInputSchema>;

export const agentTurnsSchema = z.array(agentTurnSchema);

/**
 * Keyset cursor for Server-wide turn pages: the last turn's start, ties broken
 * by its run id, so a page boundary never skips or repeats a turn.
 */
export const serverTurnsCursorSchema = z
    .object({ runId: idSchema, startedAt: timestampSchema })
    .strict();

export type ServerTurnsCursor = z.infer<typeof serverTurnsCursorSchema>;

/**
 * `agent.serverTurns`: every Agent's settled turns on one Server, newest first,
 * in the `agent.turns` shape. `agentIds` narrows to those Agents; omitted, it
 * reads them all.
 */
export const serverTurnsInputSchema = z
    .object({
        agentIds: z
            .array(idSchema)
            .min(1)
            .max(100)
            .refine((ids) => new Set(ids).size === ids.length, {
                message: 'Agent ids must be unique.',
            })
            .optional(),
        before: serverTurnsCursorSchema.optional(),
        limit: z.number().int().min(1).max(50).default(30),
        serverId: idSchema,
    })
    .strict();

export type ServerTurnsInput = z.infer<typeof serverTurnsInputSchema>;

export const serverTurnsPageSchema = z
    .object({
        nextBefore: serverTurnsCursorSchema.nullable(),
        turns: z.array(agentTurnSchema),
    })
    .strict();

export type ServerTurnsPage = z.infer<typeof serverTurnsPageSchema>;

/** One run's trigger, readable while the run still works and before it settles into a turn. */
export const agentRunTriggerInputSchema = agentDetailInputSchema.extend({ runId: idSchema });

export type AgentRunTriggerInput = z.infer<typeof agentRunTriggerInputSchema>;

/** `trigger` is null when the Server recorded none for the run, as in `agent.turns`. */
export const agentRunTriggerSchema = z
    .object({ trigger: agentTurnTriggerSchema.nullable() })
    .strict();

export type AgentRunTrigger = z.infer<typeof agentRunTriggerSchema>;
