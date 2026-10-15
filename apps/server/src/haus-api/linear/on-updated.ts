import { realtimeSubscription } from '../../realtime/subscription.ts';
import { linearUpdatedTopic } from '../../realtime/topics.ts';

/** `linear.onUpdated`: one connection's workspace or Agent identities changed. */
export const onLinearUpdated = realtimeSubscription({ topic: linearUpdatedTopic });
