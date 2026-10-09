import { canSeeChat } from '../../realtime/chat-visibility.ts';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { messageCreatedTopic } from '../../realtime/topics.ts';

export const onMessageCreatedProcedure = realtimeSubscription({
    deliver: canSeeChat,
    topic: messageCreatedTopic,
});
