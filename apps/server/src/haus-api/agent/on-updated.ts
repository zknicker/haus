import { realtimeSubscription } from '../../realtime/subscription.ts';
import { agentUpdatedTopic } from '../../realtime/topics.ts';

export const onAgentUpdatedProcedure = realtimeSubscription({ topic: agentUpdatedTopic });
