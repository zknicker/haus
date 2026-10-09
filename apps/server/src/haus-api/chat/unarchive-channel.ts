import { channelLifecycleInputSchema, channelLifecycleReceiptSchema } from '@haus/api';
import { unarchiveChannel } from '../../chats/channel-lifecycle.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { chatProcedure } from './procedure.ts';

export const unarchiveChannelProcedure = chatProcedure
    .input(channelLifecycleInputSchema)
    .output(channelLifecycleReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await unarchiveChannel(ctx.hausDb, ctx.member, input);
        if (result.event) {
            publishRealtime(result.event);
        }
        return result.receipt;
    });
