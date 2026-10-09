import { realtimeSubscription } from '../../realtime/subscription.ts';
import { computerUpdatedTopic } from '../../realtime/topics.ts';

export const onComputerUpdatedProcedure = realtimeSubscription({ topic: computerUpdatedTopic });
