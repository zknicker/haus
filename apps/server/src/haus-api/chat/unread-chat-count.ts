import { unreadChatCountSchema } from '@haus/api';
import { countUnreadChats } from '../../chats/unread-chat-count.ts';
import { chatProcedure } from './procedure.ts';

export const unreadChatCountProcedure = chatProcedure
    .output(unreadChatCountSchema)
    .query(async ({ ctx }) => ({
        count: ctx.member ? await countUnreadChats(ctx.hausDb, ctx.member.id) : 0,
    }));
