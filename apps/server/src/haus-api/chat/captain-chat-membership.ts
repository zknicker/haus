import { captainChatMembershipInputSchema, chatSchema } from '@haus/api';
import { setCaptainChatMembership } from '../../chats/captain-chat.ts';
import { ChatNotFoundError, requireChatAccess } from '../../chats/chat-access.ts';
import { listChats } from '../../chats/list-chats.ts';
import { chatProcedure } from './procedure.ts';

export const setCaptainChatMembershipProcedure = chatProcedure
    .input(captainChatMembershipInputSchema)
    .output(chatSchema)
    .mutation(async ({ ctx, input }) => {
        const chat = await requireChatAccess(ctx.hausDb, ctx.member, input);
        if (chat.kind !== 'captain' || !ctx.member) {
            throw new ChatNotFoundError();
        }
        const userId = ctx.member.id;
        await ctx.hausDb.transaction((tx) => setCaptainChatMembership(tx, { ...input, userId }));
        const listed = (await listChats(ctx.hausDb, ctx.member, input.serverId)).find(
            (candidate) => candidate.id === input.chatId
        );
        if (!listed) {
            throw new ChatNotFoundError();
        }
        return listed;
    });
