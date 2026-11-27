import { taskCrewLifecycleInputSchema, taskCrewLifecycleSchema } from '@haus/api';
import { readCrewLifecycle } from '../../tasks/crew-lifecycle.ts';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { taskProcedure } from './procedure.ts';

export const crewLifecycleProcedure = taskProcedure
    .input(taskCrewLifecycleInputSchema)
    .output(taskCrewLifecycleSchema)
    .query(
        async ({ ctx, input }) =>
            await readCrewLifecycle(ctx.hausDb, memberTaskActor(ctx.member), input)
    );
