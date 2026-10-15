import { realtimeSubscription } from '../../realtime/subscription.ts';
import { linearIssueChangedTopic } from '../../realtime/topics.ts';

/** `linear.onIssueChanged`: a delivery changed one Linear issue a chip may show. */
export const onLinearIssueChanged = realtimeSubscription({ topic: linearIssueChangedTopic });
