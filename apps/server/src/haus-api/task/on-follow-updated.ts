import { realtimeSubscription } from '../../realtime/subscription.ts';
import { taskFollowUpdatedTopic } from '../../realtime/topics.ts';

/** Follower only: the topic's audience envelope limits delivery to the follower. */
export const onTaskFollowUpdatedProcedure = realtimeSubscription({
    topic: taskFollowUpdatedTopic,
});
