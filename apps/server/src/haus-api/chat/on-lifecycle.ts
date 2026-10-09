import { canSeeChat } from '../../realtime/chat-visibility.ts';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { chatLifecycleTopic } from '../../realtime/topics.ts';

/**
 * Chat access scoped, except `deleted`: the Chat is already gone from access,
 * so every Server member hears it, and the event carries only ids.
 */
export const onChatLifecycleProcedure = realtimeSubscription({
    deliver: async (access, event) =>
        event.action === 'deleted' || (await canSeeChat(access, event)),
    topic: chatLifecycleTopic,
});
