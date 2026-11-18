import { compositionEventSchema, compositionSubscriptionInputSchema } from '@haus/api';
import { requireChatAccess } from '../../chats/chat-access.ts';
import { subscribeToChatCompositions } from '../../chats/composition-hub.ts';
import { chatProcedure } from './procedure.ts';

export const onCompositionProcedure = chatProcedure
    .input(compositionSubscriptionInputSchema)
    .use(async ({ ctx, input, next }) => {
        await requireChatAccess(ctx.hausDb, ctx.member, input);
        return await next();
    })
    .subscription(async function* ({ ctx, input, signal }) {
        for await (const event of subscribeToChatCompositions(signal)) {
            if (
                event.serverId !== input.serverId ||
                event.chatId !== input.chatId ||
                event.actorUserId === ctx.member?.id
            ) {
                continue;
            }

            await requireChatAccess(ctx.hausDb, ctx.member, input);
            yield compositionEventSchema.parse(event);
        }
    });
