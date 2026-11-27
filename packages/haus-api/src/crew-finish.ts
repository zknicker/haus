import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { taskShortIdSchema } from './task-short-id.ts';
import { taskTitleSchema } from './task.ts';

/** Most crew finishes one Captain run or busy notice carries; the rest wait for the next run. */
export const crewFinishBatchLimit = 50;

/**
 * How a crew Task's turn ended, read from its activity when the turn settled: `waiting` is
 * `needsYou`, a Task that asked a person in its chat (specs/tasks.md#activity-status).
 */
export const crewFinishEndings = ['finished', 'failed', 'waiting'] as const;
export const crewFinishEndingSchema = z.enum(crewFinishEndings);
export type CrewFinishEnding = z.infer<typeof crewFinishEndingSchema>;

/**
 * One crew Task turn that settled, for its Captain (specs/inbox.md#crew-finishes). It names the
 * Task and carries no content: the Task's chat holds what it did. `id` is its inbox identity,
 * `crew-finish:<taskId>:<runId>`.
 */
export const crewFinishSchema = z
    .object({
        ending: crewFinishEndingSchema,
        id: idSchema,
        taskShortId: taskShortIdSchema,
        title: taskTitleSchema,
    })
    .strict();

export type CrewFinish = z.infer<typeof crewFinishSchema>;

export const crewFinishesSchema = z.array(crewFinishSchema).min(1).max(crewFinishBatchLimit);

/** What a busy Captain hears: a count of its crew's queued finishes. */
export const crewFinishesNoticeSchema = z
    .object({
        ids: z.array(idSchema).min(1).max(crewFinishBatchLimit),
        total: z.number().int().positive(),
    })
    .strict();

export type CrewFinishesNotice = z.infer<typeof crewFinishesNoticeSchema>;
