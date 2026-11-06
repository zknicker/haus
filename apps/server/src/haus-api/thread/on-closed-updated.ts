import { realtimeSubscription } from '../../realtime/subscription.ts';
import { threadClosedUpdatedTopic } from '../../realtime/topics.ts';

/** One human's closes, across their devices: the topic's audience limits delivery. */
export const onThreadClosedUpdatedProcedure = realtimeSubscription({
    topic: threadClosedUpdatedTopic,
});
