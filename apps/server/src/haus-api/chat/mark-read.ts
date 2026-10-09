import { chatMarkReadInputSchema, chatReadReceiptSchema } from '@haus/api';
import { markChatRead } from '../../chats/mark-read.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { chatProcedure } from './procedure.ts';

export const markChatReadProcedure = chatProcedure
    .input(chatMarkReadInputSchema)
    .output(chatReadReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await markChatRead(ctx.hausDb, ctx.member, input);

        publishRealtime(result.events);

        return result.receipt;
    });
