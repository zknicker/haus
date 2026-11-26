import { taskArchiveInputSchema, taskMutationResultSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { unarchiveTask } from '../../tasks/task-archive.ts';
import { commitTaskWrite, taskProcedure } from './procedure.ts';

export const unarchiveTaskProcedure = taskProcedure
    .input(taskArchiveInputSchema)
    .output(taskMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitTaskWrite(ctx, await unarchiveTask(ctx.hausDb, memberTaskActor(ctx.member), input))
    );
