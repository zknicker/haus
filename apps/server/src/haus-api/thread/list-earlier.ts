import { earlierThreadListSchema, earlierThreadsInputSchema } from '@haus/api';
import { listEarlierThreads } from '../../threads/list-open-threads.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const listEarlierThreadsProcedure = chatProcedure
    .input(earlierThreadsInputSchema)
    .output(earlierThreadListSchema)
    .query(async ({ ctx, input }) => await listEarlierThreads(ctx.hausDb, ctx.member, input));
