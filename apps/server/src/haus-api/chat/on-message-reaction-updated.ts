import { canSeeChat } from '../../realtime/chat-visibility.ts';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { messageReactionUpdatedTopic } from '../../realtime/topics.ts';

export const onMessageReactionUpdatedProcedure = realtimeSubscription({
    deliver: canSeeChat,
    topic: messageReactionUpdatedTopic,
});
