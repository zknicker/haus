import { taskMutationResultSchema, taskStartInputSchema } from '@haus/api';
import { startPersonTask } from '../../tasks/task-start-person.ts';
import { commitTaskWrite, taskProcedure } from './procedure.ts';

export const startTaskProcedure = taskProcedure
    .input(taskStartInputSchema)
    .output(taskMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitTaskWrite(
            ctx,
            await startPersonTask(
                ctx.hausDb,
                { agentDelivery: ctx.agentDelivery, catalog: ctx.modelConnections.catalog },
                ctx.member,
                input
            )
        )
    );
