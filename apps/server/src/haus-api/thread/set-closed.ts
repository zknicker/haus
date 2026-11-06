import { threadClosedInputSchema } from '@haus/api';
import { publishRealtime } from '../../realtime/topic.ts';
import { setThreadClosed } from '../../threads/set-thread-closed.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const setThreadClosedProcedure = chatProcedure
    .input(threadClosedInputSchema)
    .mutation(async ({ ctx, input }) => {
        publishRealtime(await setThreadClosed(ctx.hausDb, ctx.member, input));
    });
