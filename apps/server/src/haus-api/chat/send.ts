import { chatMessageReceiptSchema, chatSendInputSchema } from '@haus/api';
import { sendChatMessage } from '../../chats/send-message.ts';
import { publishRealtime } from '../../realtime/topic.ts';
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

        publishRealtime(result.events);
        // Durable pending work is authoritative; the response never waits on its wire nudge.
        void ctx.postCommitWork.wakeAgents(ctx.agentDelivery, result.wakes);

        return result.receipt;
    });
