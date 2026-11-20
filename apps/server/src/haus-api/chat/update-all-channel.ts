import { allChannelUpdateInputSchema, allChannelUpdateResultSchema } from '@haus/api';
import { updateAllChannel } from '../../chats/update-all-channel.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { projectProcedure } from '../project/procedure.ts';

export const updateAllChannelProcedure = projectProcedure
    .input(allChannelUpdateInputSchema)
    .output(allChannelUpdateResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { events, ...result } = await updateAllChannel(ctx.hausDb, ctx.member, input);
        publishRealtime(events);
        return result;
    });
