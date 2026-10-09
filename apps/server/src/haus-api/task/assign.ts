import { taskAssignInputSchema, taskMutationSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { assignTask } from '../../tasks/assign-task.ts';
import { taskProcedure } from './procedure.ts';

export const assignTaskProcedure = taskProcedure
    .input(taskAssignInputSchema)
    .output(taskMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const actor = ctx.member ? { kind: 'human' as const, member: ctx.member } : null;
        const result = await assignTask(ctx.hausDb, actor, ctx.agentDelivery, input);

        publishRealtime(result.events);
        // Waking the assignee is what turns a reservation into work: the Agent
        // comes up, claims the task, and starts.
        await ctx.postCommitWork.wakeAgents(
            ctx.agentDelivery,
            result.wakes.map((agentId) => ({ agentId, serverId: input.serverId }))
        );

        return { task: result.task };
    });
