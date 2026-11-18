import { taskKeyListInputSchema, taskKeyListSchema } from '@haus/api';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { listTaskKeys } from '../../tasks/task-keys.ts';
import { taskProcedure } from '../task/procedure.ts';

export const listTaskKeysProcedure = taskProcedure
    .input(taskKeyListInputSchema)
    .output(taskKeyListSchema)
    .query(
        async ({ ctx, input }) => await listTaskKeys(ctx.hausDb, memberTaskActor(ctx.member), input)
    );
