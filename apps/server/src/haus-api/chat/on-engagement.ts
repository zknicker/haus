import { chatEngagementEventSchema, chatEngagementSubscriptionInputSchema } from '@haus/api';
import { subscribeToChatEngagements } from '../../agent-delivery/chat-engagement-events.ts';
import { requireChatAccess } from '../../chats/chat-access.ts';
import { chatProcedure } from './procedure.ts';

export const onChatEngagementProcedure = chatProcedure
    .input(chatEngagementSubscriptionInputSchema)
    .use(async ({ ctx, input, next }) => {
        await requireChatAccess(ctx.hausDb, ctx.member, input);
        return await next();
    })
    .subscription(async function* ({ ctx, input, signal }) {
        for await (const event of subscribeToChatEngagements(signal)) {
            if (event.serverId !== input.serverId || event.chatId !== input.chatId) {
                continue;
            }
            await requireChatAccess(ctx.hausDb, ctx.member, input);
            yield chatEngagementEventSchema.parse(event);
        }
    });
