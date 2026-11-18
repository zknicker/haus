import { realtimeSubscription } from '../../realtime/subscription.ts';
import { taskFollowUpdatedTopic } from '../../realtime/topics.ts';

export const onTaskFollowUpdatedProcedure = realtimeSubscription({
    topic: taskFollowUpdatedTopic,
});
