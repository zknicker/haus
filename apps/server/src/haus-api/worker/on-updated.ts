import { canSeeChat } from '../../realtime/chat-visibility.ts';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { workerUpdatedTopic } from '../../realtime/topics.ts';

export const onWorkerUpdatedProcedure = realtimeSubscription({
    deliver: canSeeChat,
    topic: workerUpdatedTopic,
});
