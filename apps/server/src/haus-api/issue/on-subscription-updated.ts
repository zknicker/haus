import { realtimeSubscription } from '../../realtime/subscription.ts';
import { issueSubscriptionUpdatedTopic } from '../../realtime/topics.ts';

export const onIssueSubscriptionUpdatedProcedure = realtimeSubscription({
    topic: issueSubscriptionUpdatedTopic,
});
