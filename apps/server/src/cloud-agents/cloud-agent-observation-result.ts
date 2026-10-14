import type { CloudAgentWork } from '@haus/api';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';

export interface AppliedCloudAgentObservation {
    events: PreparedRealtimeEvent[];
    wake: { agentId: string; serverId: string } | null;
    work: CloudAgentWork;
}
