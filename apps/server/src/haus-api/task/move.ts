import { taskMoveInputSchema, taskMutationResultSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { moveTask } from '../../tasks/task-move.ts';
import { commitTaskWrite, taskProcedure } from './procedure.ts';

export const moveTaskProcedure = taskProcedure
    .input(taskMoveInputSchema)
    .output(taskMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitTaskWrite(ctx, await moveTask(ctx.hausDb, memberTaskActor(ctx.member), input))
    );
