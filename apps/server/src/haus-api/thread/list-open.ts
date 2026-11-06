import { openThreadListSchema, threadScopeInputSchema } from '@haus/api';
import { listOpenThreads } from '../../threads/list-open-threads.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const listOpenThreadsProcedure = chatProcedure
    .input(threadScopeInputSchema)
    .output(openThreadListSchema)
    .query(async ({ ctx, input }) => await listOpenThreads(ctx.hausDb, ctx.member, input.serverId));
