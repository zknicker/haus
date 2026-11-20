import { realtimeSubscription } from '../../realtime/subscription.ts';
import { projectUpdatedTopic } from '../../realtime/topics.ts';

export const onProjectUpdatedProcedure = realtimeSubscription({ topic: projectUpdatedTopic });
