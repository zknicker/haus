import { realtimeSubscription } from '../../realtime/subscription.ts';
import { taskLabelUpdatedTopic } from '../../realtime/topics.ts';

export const onTaskLabelUpdatedProcedure = realtimeSubscription({ topic: taskLabelUpdatedTopic });
