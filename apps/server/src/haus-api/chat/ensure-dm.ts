import { chatSchema, ensureDmInputSchema } from '@haus/api';
import { ensureDm } from '../../chats/ensure-dm.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { chatProcedure } from './procedure.ts';

export const ensureDmProcedure = chatProcedure
    .input(ensureDmInputSchema)
    .output(chatSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await ensureDm(ctx.hausDb, ctx.member, input);
        // `chat.onLifecycle` rechecks Chat access per delivery, which narrows a DM's
        // lifecycle event to its two members and reaches the peer too.
        if (result.event) {
            publishRealtime(result.event);
        }
        return result.chat;
    });
