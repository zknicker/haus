import { channelLifecycleInputSchema, channelLifecycleReceiptSchema } from '@haus/api';
import { archiveChannel } from '../../chats/channel-lifecycle.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { chatProcedure } from './procedure.ts';

export const archiveChannelProcedure = chatProcedure
    .input(channelLifecycleInputSchema)
    .output(channelLifecycleReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await archiveChannel(ctx.hausDb, ctx.member, input);
        if (result.event) {
            publishRealtime(result.event);
        }
        return result.receipt;
    });
