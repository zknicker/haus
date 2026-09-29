import { inboxMarkDoneInputSchema, inboxMarkDoneResultSchema } from '@haus/api';
import { emitDurableChatEvent } from '../../chats/durable-events.ts';
import { markNeedsYouDone } from '../../needs-you/mark-done.ts';
import { inboxProcedure } from './procedure.ts';

export const markDoneProcedure = inboxProcedure
    .input(inboxMarkDoneInputSchema)
    .output(inboxMarkDoneResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { event, result } = await markNeedsYouDone(ctx.hausDb, ctx.member, input);
        if (event && ctx.member) {
            emitDurableChatEvent({ audienceUserId: ctx.member.id, event });
        }
        return result;
    });
