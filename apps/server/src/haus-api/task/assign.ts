import { taskAssignInputSchema, taskMutationSchema } from '@haus/api';
import { emitDurableChatEvent } from '../../chats/durable-events.ts';
import { assignTask } from '../../tasks/assign-task.ts';
import { taskProcedure } from './procedure.ts';

export const assignTaskProcedure = taskProcedure
    .input(taskAssignInputSchema)
    .output(taskMutationSchema)
    .mutation(async ({ ctx, input }) => {
        const actor = ctx.member ? { kind: 'human' as const, member: ctx.member } : null;
        const result = await assignTask(ctx.hausDb, actor, ctx.agentDelivery, input);

        for (const event of result.events) {
            emitDurableChatEvent({ audienceUserId: null, event });
        }
        // Waking the assignee is what turns a reservation into work: the Agent
        // comes up, claims the task, and starts.
        await ctx.postCommitWork.wakeAgents(
            ctx.agentDelivery,
            result.wakes.map((agentId) => ({ agentId, serverId: input.serverId }))
        );

        // The task update is the cursor clients resume from; the receipt is
        // private Agent traffic they never render.
        return { eventCursor: result.events[0]?.cursor ?? null, task: result.task };
    });
