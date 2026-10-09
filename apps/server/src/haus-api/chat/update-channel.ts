import { channelUpdateInputSchema, chatSchema } from '@haus/api';
import { updateChannel } from '../../chats/update-channel.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { chatProcedure } from './procedure.ts';

export const updateChannelProcedure = chatProcedure
    .input(channelUpdateInputSchema)
    .output(chatSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await updateChannel(ctx.hausDb, ctx.member, input);
        if (result.event) {
            publishRealtime(result.event);
        }
        return result.chat;
    });
