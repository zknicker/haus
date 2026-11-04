import { taskMutationResultSchema, taskUpdateInputSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { updateTask } from '../../tasks/task-update.ts';
import { commitTaskWrite, taskProcedure } from './procedure.ts';

export const updateTaskProcedure = taskProcedure
    .input(taskUpdateInputSchema)
    .output(taskMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitTaskWrite(ctx, await updateTask(ctx.hausDb, memberTaskActor(ctx.member), input))
    );
