import { threadFollowInputSchema, threadFollowReceiptSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { setThreadFollow } from '../../threads/set-thread-follow.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const setThreadFollowProcedure = chatProcedure
    .input(threadFollowInputSchema)
    .output(threadFollowReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await setThreadFollow(ctx.hausDb, ctx.member, input);
        publishRealtime(result.event);
        return result.receipt;
    });
