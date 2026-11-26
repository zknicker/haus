import { channelDeleteInputSchema, channelDeleteReceiptSchema } from '@haus/api';
import { deleteChannel } from '../../chats/channel-lifecycle.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { announceTaskSessions } from '../../tasks/task-session.ts';
import { chatProcedure } from './procedure.ts';

export const deleteChannelProcedure = chatProcedure
    .input(channelDeleteInputSchema)
    .output(channelDeleteReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await deleteChannel(
            ctx.hausDb,
            ctx.attachmentRoot,
            ctx.member,
            input,
            ctx.agentDelivery
        );
        for (const event of result.events) {
            publishRealtime(event);
        }
        for (const { computerId, frame } of result.workerFrames) {
            ctx.computerConnections.send(computerId, frame);
        }
        announceTaskSessions(
            { invocations: ctx.invocations, runner: ctx.runnerLink },
            result.taskSessions
        );
        void ctx.postCommitWork.wakeAgents(ctx.agentDelivery, result.taskWakes);
        return result.receipt;
    });
