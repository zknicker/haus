import { taskListActiveInputSchema, taskListSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { listActiveTasks } from '../../tasks/task-list.ts';
import { taskProcedure } from './procedure.ts';

export const listActiveTasksProcedure = taskProcedure
    .input(taskListActiveInputSchema)
    .output(taskListSchema)
    .query(
        async ({ ctx, input }) =>
            await listActiveTasks(ctx.hausDb, memberTaskActor(ctx.member), input)
    );
