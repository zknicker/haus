import { realtimeSubscription } from '../../realtime/subscription.ts';
import { mcpUpdatedTopic } from '../../realtime/topics.ts';

export const onMcpUpdatedProcedure = realtimeSubscription({ topic: mcpUpdatedTopic });
