import { chatMessageInputSchema, chatMessageReadSchema } from '@haus/api';
import { readChatMessage } from '../../chats/read-message.ts';
import { chatProcedure } from './procedure.ts';

export const readChatMessageProcedure = chatProcedure
    .input(chatMessageInputSchema)
    .output(chatMessageReadSchema)
    .query(async ({ ctx, input }) => await readChatMessage(ctx.hausDb, ctx.member, input));
