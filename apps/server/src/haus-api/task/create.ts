import { taskCreateInputSchema, taskPromotionSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { createTask } from '../../tasks/create-task.ts';
import { taskProcedure } from './procedure.ts';

export const createTaskProcedure = taskProcedure
    .input(taskCreateInputSchema)
    .output(taskPromotionSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await createTask(ctx.hausDb, ctx.member, input, ctx.agentDelivery);

        publishRealtime(result.events);
        await ctx.postCommitWork.wakeAgents(ctx.agentDelivery, result.wakes);

        return { idempotent: result.idempotent, task: result.task };
    });
