import { realtimeSubscription } from '../../realtime/subscription.ts';
import { cloudAgentSettingsUpdatedTopic } from '../../realtime/topics.ts';

export const onCloudAgentSettingsUpdatedProcedure = realtimeSubscription({
    topic: cloudAgentSettingsUpdatedTopic,
});
