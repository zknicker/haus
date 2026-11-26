import { realtimeSubscription } from '../../realtime/subscription.ts';
import { issueCommentedTopic } from '../../realtime/topics.ts';

export const onIssueCommentedProcedure = realtimeSubscription({ topic: issueCommentedTopic });
