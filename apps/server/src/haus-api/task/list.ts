import { taskListInputSchema, taskListSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { listTasks } from '../../tasks/task-list.ts';
import { taskProcedure } from './procedure.ts';

export const listTasksProcedure = taskProcedure
    .input(taskListInputSchema)
    .output(taskListSchema)
    .query(
        async ({ ctx, input }) => await listTasks(ctx.hausDb, memberTaskActor(ctx.member), input)
    );
