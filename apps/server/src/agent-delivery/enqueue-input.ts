import type { AddressedReason } from '@haus/api';

export interface EnqueueInput {
    /** Why this item names the Agent personally; null is an ambient delivery. */
    addressedReason?: AddressedReason | null;
    agentId: string;
    chatId: string | null;
    /** The Run and reason a `cloud_agent_work` notice describes. */
    cloudAgentNotice?: 'settled' | 'stall';
    cloudAgentRunId?: string;
    content: string;
    /** Queue time for work with no Chat message of its own, such as an automation fire. */
    createdAt?: Date;
    /** Idempotency key; a duplicate delivery of the same message is a no-op. */
    dedupeKey: string;
    mentioned?: boolean;
    sequence?: number;
    serverId: string;
    source?: string;
    threadFollowReactivated?: boolean;
}
