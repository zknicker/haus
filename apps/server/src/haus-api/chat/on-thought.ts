import { agentThoughtEventSchema, agentThoughtSubscriptionInputSchema } from '@haus/api';
import { subscribeToAgentThoughts } from '../../agent-delivery/thought-events.ts';
import { requireChatAccess } from '../../chats/chat-access.ts';
import { chatProcedure } from './procedure.ts';

/**
 * Volatile Agent thought phrases for one Chat (ADR 0036). Thoughts
 * describe a whole run, so they reach only readers of a Chat that run engages,
 * checked like `chat.onEngagement` at start and on every delivery.
 */
export const onChatThoughtProcedure = chatProcedure
    .input(agentThoughtSubscriptionInputSchema)
    .use(async ({ ctx, input, next }) => {
        await requireChatAccess(ctx.hausDb, ctx.member, input);
        return await next();
    })
    .subscription(async function* ({ ctx, input, signal }) {
        for await (const event of subscribeToAgentThoughts(signal)) {
            if (event.serverId !== input.serverId || event.chatId !== input.chatId) {
                continue;
            }
            await requireChatAccess(ctx.hausDb, ctx.member, input);
            yield agentThoughtEventSchema.parse(event);
        }
    });
