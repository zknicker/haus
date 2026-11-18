import { taskListOpenInputSchema, taskListSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { listOpenTasks } from '../../tasks/task-list.ts';
import { taskProcedure } from './procedure.ts';

export const listOpenTasksProcedure = taskProcedure
    .input(taskListOpenInputSchema)
    .output(taskListSchema)
    .query(
        async ({ ctx, input }) =>
            await listOpenTasks(ctx.hausDb, memberTaskActor(ctx.member), input)
    );
