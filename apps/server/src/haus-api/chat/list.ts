import { chatListInputSchema, chatListSchema } from '@haus/api';
import { listChats } from '../../chats/list-chats.ts';
import { chatProcedure } from './procedure.ts';

export const listChatsProcedure = chatProcedure
    .input(chatListInputSchema)
    .output(chatListSchema)
    .query(async ({ ctx, input }) => await listChats(ctx.hausDb, ctx.member, input.serverId));
