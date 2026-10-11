import { unreadChatCountSchema } from '@haus/api';
import { countUnreadInboxRows } from '../../chats/unread-chat-count.ts';
import { chatProcedure } from './procedure.ts';

export const unreadChatCountProcedure = chatProcedure
    .output(unreadChatCountSchema)
    .query(async ({ ctx }) => ({
        count: ctx.member ? await countUnreadInboxRows(ctx.hausDb, ctx.member.id) : 0,
    }));
