import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { taskShortIdSchema } from './task-short-id.ts';
import { taskTitleSchema } from './task.ts';

/** `task.crewLifecycle`: what a Captain's crew did, for the quiet lines in its Captain chat. */
export const taskCrewLifecycleInputSchema = z
    .object({ captainId: idSchema, serverId: idSchema })
    .strict();

const crewTaskFields = { shortId: taskShortIdSchema, taskId: idSchema, title: taskTitleSchema };

/** A crew Task's settled turn. An interrupted turn is not a finish and never lists. */
export const crewTurnSchema = z
    .object({
        ...crewTaskFields,
        endedAt: timestampSchema,
        startedAt: timestampSchema,
        status: z.enum(['completed', 'failed']),
    })
    .strict();

export const crewArchiveSchema = z
    .object({ ...crewTaskFields, archivedAt: timestampSchema })
    .strict();

/** Newest first, each list capped at `CREW_LIFECYCLE_LIMIT`. */
export const taskCrewLifecycleSchema = z
    .object({ archives: z.array(crewArchiveSchema), turns: z.array(crewTurnSchema) })
    .strict();

export const CREW_LIFECYCLE_LIMIT = 200;

export type TaskCrewLifecycleInput = z.infer<typeof taskCrewLifecycleInputSchema>;
export type CrewTurn = z.infer<typeof crewTurnSchema>;
export type CrewArchive = z.infer<typeof crewArchiveSchema>;
export type TaskCrewLifecycle = z.infer<typeof taskCrewLifecycleSchema>;
