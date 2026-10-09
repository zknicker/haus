import { realtimeSubscription } from '../../realtime/subscription.ts';
import { threadFollowUpdatedTopic } from '../../realtime/topics.ts';

/** Follower only: the topic's audience envelope limits delivery to the follower. */
export const onThreadFollowUpdatedProcedure = realtimeSubscription({
    topic: threadFollowUpdatedTopic,
});
