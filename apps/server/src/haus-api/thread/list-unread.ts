import { threadUnreadListInputSchema, unreadThreadListSchema } from '@haus/api';
import { listUnreadThreads } from '../../threads/list-unread-threads.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const listUnreadThreadsProcedure = chatProcedure
    .input(threadUnreadListInputSchema)
    .output(unreadThreadListSchema)
    .query(async ({ ctx, input }) => ({
        threads: await listUnreadThreads(ctx.hausDb, ctx.member, input.serverId),
    }));
