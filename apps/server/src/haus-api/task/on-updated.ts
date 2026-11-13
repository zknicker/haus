import { realtimeSubscription } from '../../realtime/subscription.ts';
import { taskUpdatedTopic } from '../../realtime/topics.ts';

/** Every member: an edit, move, assignment, or column restructure. */
export const onTaskUpdatedProcedure = realtimeSubscription({ topic: taskUpdatedTopic });
