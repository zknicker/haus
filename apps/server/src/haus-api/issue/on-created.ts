import { realtimeSubscription } from '../../realtime/subscription.ts';
import { issueCreatedTopic } from '../../realtime/topics.ts';

export const onIssueCreatedProcedure = realtimeSubscription({ topic: issueCreatedTopic });
