import { realtimeSubscription } from '../../realtime/subscription.ts';
import { taskCreatedTopic } from '../../realtime/topics.ts';

/** Every member: every Task is visible to every member and Agent (ADR 0051). */
export const onTaskCreatedProcedure = realtimeSubscription({ topic: taskCreatedTopic });
