import { chatMarkReadInputSchema, chatReadReceiptSchema } from '@haus/api';
import { emitDurableChatEvent } from '../../chats/durable-events.ts';
import { markChatRead } from '../../chats/mark-read.ts';
import { chatProcedure } from './procedure.ts';

export const markChatReadProcedure = chatProcedure
    .input(chatMarkReadInputSchema)
    .output(chatReadReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await markChatRead(ctx.hausDb, ctx.member, input);

        if (ctx.member) {
            for (const event of result.events) {
                emitDurableChatEvent({ audienceUserId: ctx.member.id, event });
            }
        }

        return result.receipt;
    });
