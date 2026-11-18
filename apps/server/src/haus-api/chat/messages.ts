import { chatMessagePageSchema, chatMessagesInputSchema } from '@haus/api';
import { listChatMessages } from '../../chats/list-messages.ts';
import { chatProcedure } from './procedure.ts';

export const listChatMessagesProcedure = chatProcedure
    .input(chatMessagesInputSchema)
    .output(chatMessagePageSchema)
    .query(async ({ ctx, input }) => await listChatMessages(ctx.hausDb, ctx.member, input));
