import { realtimeSubscription } from '../../realtime/subscription.ts';
import { issueUpdatedTopic } from '../../realtime/topics.ts';

export const onIssueUpdatedProcedure = realtimeSubscription({ topic: issueUpdatedTopic });
