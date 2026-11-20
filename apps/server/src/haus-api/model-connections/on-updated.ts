import { realtimeSubscription } from '../../realtime/subscription.ts';
import { modelConnectionsUpdatedTopic } from '../../realtime/topics.ts';

export const onModelConnectionsUpdatedProcedure = realtimeSubscription({
    topic: modelConnectionsUpdatedTopic,
});
