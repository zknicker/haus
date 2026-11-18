import { chatGetInputSchema, chatSchema } from '@haus/api';
import { getChat } from '../../chats/get-chat.ts';
import { chatProcedure } from './procedure.ts';

export const getChatProcedure = chatProcedure
    .input(chatGetInputSchema)
    .output(chatSchema)
    .query(async ({ ctx, input }) => await getChat(ctx.hausDb, ctx.member, input));
