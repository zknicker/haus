import { realtimeSubscription } from '../../realtime/subscription.ts';
import { artifactUpdatedTopic } from '../../realtime/topics.ts';

export const onArtifactUpdatedProcedure = realtimeSubscription({ topic: artifactUpdatedTopic });
