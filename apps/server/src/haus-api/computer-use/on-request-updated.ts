import { computerUseRequestsInputSchema } from '@haus/api';
import { requireChatAccess } from '../../chats/chat-access.ts';
import { subscribeToComputerUseRequests } from '../../computer-use/computer-use-events.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const onComputerUseRequestUpdatedProcedure = chatProcedure
    .input(computerUseRequestsInputSchema)
    .use(async ({ ctx, input, next }) => {
        await requireChatAccess(ctx.hausDb, ctx.member, input);
        return await next();
    })
    .subscription(async function* ({ ctx, input, signal }) {
        for await (const event of subscribeToComputerUseRequests(signal)) {
            if (event.serverId !== input.serverId || event.chatId !== input.chatId) {
                continue;
            }
            await requireChatAccess(ctx.hausDb, ctx.member, input);
            yield event;
        }
    });
