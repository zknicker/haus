import * as z from 'zod';
import { idSchema } from './chat.ts';
import { timestampSchema } from './chat-contract-primitives.ts';

/**
 * Why the Server did not start a heartbeat it was asked for (specs/heartbeat.md,
 * "Who runs, and who skips"). `plan-limit` is the 80% weekly-meter pause.
 */
export const heartbeatSkipReasonSchema = z.enum([
    'busy',
    'stopped',
    'plan-limit',
    'no-activity',
    'not-configured',
]);

export type HeartbeatSkipReason = z.infer<typeof heartbeatSkipReasonSchema>;

/**
 * One mark on an Agent's heartbeat lane: a slot the Server ran, skipped, or paused.
 * `yielded` is a daytime run stopped for a message addressed to the Agent; `failed`
 * settled with an error. A nightly mark is the dream.
 */
export const heartbeatMarkSchema = z
    .object({
        /** The run's start, or the request time for a skipped or paused slot. */
        at: timestampSchema,
        /** Settled duration; null while running or when no run started. */
        durationMs: z.number().int().nonnegative().nullable(),
        /** The dream's own facts; nightly marks that ran only. */
        dream: z
            .object({
                added: z.number().int().nonnegative(),
                /** Titles of the follow-ups it scheduled, oldest first, bounded. */
                followUpTitles: z.array(z.string()),
                followUps: z.number().int().nonnegative(),
                removed: z.number().int().nonnegative(),
                /** The full "what I learned" summary; null when it wrote none. */
                summary: z.string().nullable(),
                /** First line of the "what I learned" summary, bullet stripped. */
                summaryLine: z.string().nullable(),
            })
            .strict()
            .nullable(),
        kind: z.enum(['daytime', 'nightly']),
        outcome: z.enum(['running', 'quiet', 'reported', 'yielded', 'failed', 'skipped', 'paused']),
        /** The report the run filed and what the main session did with it. */
        report: z
            .object({
                /** The Chat the main session posted in after reading it; null when it stayed quiet. */
                postedChatId: idSchema.nullable(),
                text: z.string(),
            })
            .strict()
            .nullable(),
        runId: idSchema.nullable(),
        skipReason: heartbeatSkipReasonSchema.nullable(),
        /** Total tokens the run reported; null while running or when no run started. */
        tokens: z.number().int().nonnegative().nullable(),
    })
    .strict();

export type HeartbeatMark = z.infer<typeof heartbeatMarkSchema>;

export const heartbeatLaneSchema = z
    .object({
        agentId: idSchema,
        /** Oldest first. */
        marks: z.array(heartbeatMarkSchema),
        tokens: z.number().int().nonnegative(),
    })
    .strict();

export type HeartbeatLane = z.infer<typeof heartbeatLaneSchema>;

/**
 * Heartbeat and dream cost on one Computer plan this week, as an estimated share of
 * its weekly meter: the plan's reported utilization split by token share.
 */
export const heartbeatPlanShareSchema = z
    .object({
        dreamPercent: z.number().nonnegative(),
        heartbeatPercent: z.number().nonnegative(),
        /** The plan's display label, e.g. "Claude Max" or "ChatGPT Pro". */
        label: z.string().min(1),
        runtimeId: z.string().min(1),
        /** The meter's reported weekly utilization. */
        usedPercent: z.number().nonnegative(),
    })
    .strict();

export type HeartbeatPlanShare = z.infer<typeof heartbeatPlanShareSchema>;

export const agentHeartbeatsInputSchema = z
    .object({
        /** Narrows to these Agents; omitted means every Agent the viewer can see. */
        agentIds: z.array(idSchema).min(1).max(50).optional(),
        /** The window's bounds, normally the viewer's local day. */
        from: timestampSchema,
        serverId: idSchema,
        to: timestampSchema,
    })
    .strict();

export type AgentHeartbeatsInput = z.infer<typeof agentHeartbeatsInputSchema>;

export const agentHeartbeatsSchema = z
    .object({
        lanes: z.array(heartbeatLaneSchema),
        summary: z
            .object({
                followUps: z.number().int().nonnegative(),
                paused: z.number().int().nonnegative(),
                plans: z.array(heartbeatPlanShareSchema),
                posts: z.number().int().nonnegative(),
                reported: z.number().int().nonnegative(),
                rulesLearned: z.number().int().nonnegative(),
                runs: z.number().int().nonnegative(),
                skipped: z.number().int().nonnegative(),
                yielded: z.number().int().nonnegative(),
            })
            .strict(),
    })
    .strict();

export type AgentHeartbeats = z.infer<typeof agentHeartbeatsSchema>;
