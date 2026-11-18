import { channelCreateInputSchema, chatSchema } from '@haus/api';
import { createChannel } from '../../chats/create-channel.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { chatProcedure } from './procedure.ts';

export const createChannelProcedure = chatProcedure
    .input(channelCreateInputSchema)
    .output(chatSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await createChannel(ctx.hausDb, ctx.member, input);
        publishRealtime(result.event);
        return result.chat;
    });
