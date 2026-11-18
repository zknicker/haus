import { taskMutationResultSchema, taskSetStateInputSchema } from '@haus/api';

import { memberTaskActor } from '../../tasks/task-actor.ts';
import { setTaskState } from '../../tasks/task-set-state.ts';
import { commitTaskWrite, taskProcedure } from './procedure.ts';

export const setTaskStateProcedure = taskProcedure
    .input(taskSetStateInputSchema)
    .output(taskMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitTaskWrite(ctx, await setTaskState(ctx.hausDb, memberTaskActor(ctx.member), input))
    );
