import { taskAssignInputSchema, taskMutationResultSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { assignTask } from '../../tasks/task-assign.ts';
import { commitTaskWrite, taskProcedure } from './procedure.ts';

export const assignTaskProcedure = taskProcedure
    .input(taskAssignInputSchema)
    .output(taskMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitTaskWrite(
            ctx,
            await assignTask(ctx.hausDb, memberTaskActor(ctx.member), ctx.agentDelivery, input)
        )
    );
