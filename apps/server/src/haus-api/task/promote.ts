import { taskPromoteInputSchema, taskPromotionSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { promoteMessageTask } from '../../tasks/promote-task.ts';
import { taskProcedure } from './procedure.ts';

export const promoteTaskProcedure = taskProcedure
    .input(taskPromoteInputSchema)
    .output(taskPromotionSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await promoteMessageTask(ctx.hausDb, ctx.member, input);
        if (result.event) {
            publishRealtime(result.event);
        }
        return { idempotent: result.idempotent, task: result.task };
    });
