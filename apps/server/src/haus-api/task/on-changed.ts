import { canSeeChat } from '../../realtime/chat-visibility.ts';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { taskChangedTopic } from '../../realtime/topics.ts';

export const onTaskChangedProcedure = realtimeSubscription({
    deliver: canSeeChat,
    topic: taskChangedTopic,
});
