import { chatMessageReceiptSchema, chatSendInputSchema } from '@haus/api';
import { sendChatMessage } from '../../chats/send-message.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { publishTaskSessionResets } from '../../tasks/task-session.ts';
import { chatProcedure } from './procedure.ts';

export const sendChatMessageProcedure = chatProcedure
    .input(chatSendInputSchema)
    .output(chatMessageReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await sendChatMessage(
            ctx.hausDb,
            ctx.member,
            input,
            ctx.agentDelivery,
            ctx.messageRouter
        );

        publishTaskSessionResets(result.sessions);
        publishRealtime(result.events);
        // Durable pending work is authoritative; the response never waits on its wire nudge.
        void ctx.postCommitWork.wakeRecipients(ctx.agentDelivery, result);

        return result.receipt;
    });
