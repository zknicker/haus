import { realtimeSubscription } from '../../realtime/subscription.ts';
import { desktopActivityTopic } from '../../realtime/topics.ts';

export const onDesktopActivityProcedure = realtimeSubscription({ topic: desktopActivityTopic });
