import type { AddressedReason, TaskDeliveryMode } from '@haus/api';

export interface EnqueueInput {
    /** Why this item names the Agent personally; null is an ambient delivery. */
    addressedReason?: AddressedReason | null;
    agentId: string;
    chatId: string | null;
    content: string;
    /** Queue time for work with no Chat message of its own, such as an automation fire. */
    createdAt?: Date;
    /** Idempotency key; a duplicate delivery of the same message is a no-op. */
    dedupeKey: string;
    /** How a message reaches a Task agent; everything else is `steer` (ADR 0062). */
    delivery?: TaskDeliveryMode;
    mentioned?: boolean;
    sequence?: number;
    serverId: string;
    source?: string;
    taskFollowReactivated?: boolean;
}
