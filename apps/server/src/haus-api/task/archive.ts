import { taskArchiveInputSchema, taskMutationResultSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { archiveTask } from '../../tasks/task-archive.ts';
import { commitTaskWrite, taskProcedure } from './procedure.ts';

export const archiveTaskProcedure = taskProcedure
    .input(taskArchiveInputSchema)
    .output(taskMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitTaskWrite(
            ctx,
            await archiveTask(ctx.hausDb, memberTaskActor(ctx.member), ctx.agentDelivery, input)
        )
    );
