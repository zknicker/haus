import { realtimeSubscription } from '../../realtime/subscription.ts';
import { memberUpdatedTopic } from '../../realtime/topics.ts';

export const onMemberUpdatedProcedure = realtimeSubscription({ topic: memberUpdatedTopic });
