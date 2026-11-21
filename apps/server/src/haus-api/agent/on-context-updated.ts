import { realtimeSubscription } from '../../realtime/subscription.ts';
import { agentContextUpdatedTopic } from '../../realtime/topics.ts';

export const onAgentContextUpdatedProcedure = realtimeSubscription({
    topic: agentContextUpdatedTopic,
});
