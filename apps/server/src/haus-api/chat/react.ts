import { chatMessageReactionInputSchema, chatMessageReactionReceiptSchema } from '@haus/api';
import { changeMessageReaction } from '../../chats/change-message-reaction.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { chatProcedure } from './procedure.ts';

export const reactToChatMessageProcedure = chatProcedure
    .input(chatMessageReactionInputSchema)
    .output(chatMessageReactionReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await changeMessageReaction(ctx.hausDb, ctx.member, input);
        if (result.event) {
            publishRealtime(result.event);
        }
        return result.receipt;
    });
