import { canSeeChat } from '../../realtime/chat-visibility.ts';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { claimChangedTopic } from '../../realtime/topics.ts';

export const onClaimChangedProcedure = realtimeSubscription({
    deliver: canSeeChat,
    topic: claimChangedTopic,
});
