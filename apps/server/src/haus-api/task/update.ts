import { taskMutationSchema, taskUpdateInputSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { updateTask } from '../../tasks/update-task.ts';
import { taskProcedure } from './procedure.ts';

export const updateTaskProcedure = taskProcedure
    .input(taskUpdateInputSchema)
    .output(taskMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await updateTask(ctx.hausDb, ctx.member, input);
        if (result.event) {
            publishRealtime(result.event);
        }
        return { task: result.task };
    });
