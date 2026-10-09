import { realtimeSubscription } from '../../realtime/subscription.ts';
import { serverUpdatedTopic } from '../../realtime/topics.ts';

/**
 * The membership sentinel (specs/realtime-events.md): Server deletion and member
 * departure publish `server.updated`, so this stream's per-delivery recheck ends
 * it with `membership_lost` for whoever just lost access.
 */
export const onServerUpdatedProcedure = realtimeSubscription({ topic: serverUpdatedTopic });
