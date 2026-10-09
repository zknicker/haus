import { realtimeSubscription } from '../../realtime/subscription.ts';
import { chatReadTopic } from '../../realtime/topics.ts';

/** Reader only: the topic's audience envelope limits delivery to the reader. */
export const onChatReadProcedure = realtimeSubscription({ topic: chatReadTopic });
