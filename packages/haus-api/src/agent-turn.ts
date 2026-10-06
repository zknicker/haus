import * as z from 'zod';
import { agentDetailInputSchema } from './agent.ts';
import { agentTurnActivitySummarySchema } from './agent-activity.ts';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * What woke an Agent turn: the inbox item the Server chose when it dispatched the
 * run. It carries ids only (ADR 0023); the App resolves a message's text through
 * its ordinary message reads, which apply their own access rules.
 *
 * - `message`: a Chat message from a human or another Agent.
 * - `task`: a task assignment; `messageId` is the task's message.
 * - `reminder`, `trigger`, `cloud_agent`, `onboarding`: typed work anchored to a Chat
 *   with no message of its own.
 * - `private`: the turn has a recorded trigger in a Chat the reader cannot see.
 */
export const agentTurnTriggerSchema = z.discriminatedUnion('kind', [
    z
        .object({
            author: z.enum(['agent', 'human']),
            chatId: idSchema,
            kind: z.literal('message'),
            messageId: idSchema,
        })
        .strict(),
    z.object({ chatId: idSchema, kind: z.literal('task'), messageId: idSchema }).strict(),
    z.object({ chatId: idSchema, kind: z.literal('reminder') }).strict(),
    z.object({ chatId: idSchema, kind: z.literal('trigger') }).strict(),
    z.object({ chatId: idSchema, kind: z.literal('cloud_agent') }).strict(),
    z.object({ chatId: idSchema, kind: z.literal('onboarding') }).strict(),
    z.object({ kind: z.literal('private') }).strict(),
]);

export type AgentTurnTrigger = z.infer<typeof agentTurnTriggerSchema>;

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

/** One run's trigger, readable while the run still works and before it settles into a turn. */
export const agentRunTriggerInputSchema = agentDetailInputSchema.extend({ runId: idSchema });

export type AgentRunTriggerInput = z.infer<typeof agentRunTriggerInputSchema>;

/** `trigger` is null when the Server recorded none for the run, as in `agent.turns`. */
export const agentRunTriggerSchema = z
    .object({ trigger: agentTurnTriggerSchema.nullable() })
    .strict();

export type AgentRunTrigger = z.infer<typeof agentRunTriggerSchema>;
