import { taskListOpenInputSchema, taskListSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { listOpenTasks } from '../../tasks/task-list.ts';
import { taskProcedure } from './procedure.ts';

/** The sidebar: every `open` Task whose origin Channel the viewer can see (ADR 0052 decision 8). */
export const listOpenTasksProcedure = taskProcedure
    .input(taskListOpenInputSchema)
    .output(taskListSchema)
    .query(
        async ({ ctx, input }) =>
            await listOpenTasks(ctx.hausDb, memberTaskActor(ctx.member), input)
    );
