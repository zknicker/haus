import { realtimeSubscription } from '../../realtime/subscription.ts';
import { boardUpdatedTopic } from '../../realtime/topics.ts';

/** Every member: boards have no private mode (ADR 0051). */
export const onBoardUpdatedProcedure = realtimeSubscription({ topic: boardUpdatedTopic });
