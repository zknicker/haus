import { canSeeChat } from '../../realtime/chat-visibility.ts';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { cloudAgentWorkUpdatedTopic } from '../../realtime/topics.ts';

export const onCloudAgentWorkUpdatedProcedure = realtimeSubscription({
    deliver: canSeeChat,
    topic: cloudAgentWorkUpdatedTopic,
});
