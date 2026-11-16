import { taskCreateInputSchema, taskMutationResultSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { createTask } from '../../tasks/task-create.ts';
import { commitTaskWrite, taskProcedure } from './procedure.ts';

export const createTaskProcedure = taskProcedure
    .input(taskCreateInputSchema)
    .output(taskMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitTaskWrite(
            ctx,
            await createTask(ctx.hausDb, memberTaskActor(ctx.member), ctx.agentDelivery, input)
        )
    );
