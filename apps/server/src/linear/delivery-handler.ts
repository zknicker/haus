import type { LinearDeliveryIgnoredReason } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import type { Payload } from './delivery-payload.ts';

// The delivery worker's routing contract: a claimed row, a step's outcome, and
// the handlers each Linear event family routes through.

export interface LinearDeliveryRow {
    action: string | null;
    attempts: number;
    body: Payload;
    deferredSince: Date | null;
    deliveryId: string;
    event: string;
    id: string;
    receivedAt: Date;
    /** `app` or an identity id. */
    receiver: string;
    serverId: string;
    webhookTimestamp: Date;
    workspaceId: string;
}

/** Work that may only happen once the routing transaction committed. */
export interface LinearDeliveryEffects {
    announce: PreparedRealtimeEvent[];
    wakes: { agentId: string; serverId: string }[];
}

export type LinearDeliveryOutcome =
    | ({ kind: 'done'; routed: number } & LinearDeliveryEffects)
    | { kind: 'ignored'; reason: LinearDeliveryIgnoredReason }
    /** A pending ledger candidate: stay queued and look again shortly. */
    | { kind: 'defer' };

/**
 * One step of routing. `prepare` runs before the transaction (Linear reads a
 * projection needs); `apply` runs inside it, under the Server row lock, and
 * writes Linear side effects to the outbox, never calling Linear inline.
 */
export interface LinearDeliveryHandler<Prepared = unknown> {
    apply(
        tx: HausDatabase,
        row: LinearDeliveryRow,
        now: Date,
        prepared: Prepared | undefined
    ): Promise<LinearDeliveryOutcome>;
    prepare?(row: LinearDeliveryRow): Promise<Prepared>;
}

export interface LinearDeliveryHandlers {
    /** Issue, Comment, Project, IssueLabel, WorkflowState. */
    dataChange: LinearDeliveryHandler;
    /** `OAuthApp` revoked and `PermissionChange` (the binding slice's effects). */
    lifecycle: LinearDeliveryHandler;
    /** `AgentSessionEvent`. */
    session: LinearDeliveryHandler;
}

/** A claimed row as PostgreSQL returns it from the raw claim statement. */
export interface RawDeliveryRow {
    action: string | null;
    attempts: number;
    body: Payload | string | null;
    deferred_since: Date | string | null;
    delivery_id: string;
    event: string;
    id: string;
    received_at: Date | string;
    receiver: string;
    server_id: string;
    webhook_timestamp: Date | string;
    workspace_id: string;
}

export function toDeliveryRow(raw: RawDeliveryRow): LinearDeliveryRow {
    const body = typeof raw.body === 'string' ? (JSON.parse(raw.body) as Payload) : raw.body;
    return {
        action: raw.action,
        attempts: raw.attempts,
        body: body ?? {},
        deferredSince: raw.deferred_since === null ? null : new Date(raw.deferred_since),
        deliveryId: raw.delivery_id,
        event: raw.event,
        id: raw.id,
        receivedAt: new Date(raw.received_at),
        receiver: raw.receiver,
        serverId: raw.server_id,
        webhookTimestamp: new Date(raw.webhook_timestamp),
        workspaceId: raw.workspace_id,
    };
}
