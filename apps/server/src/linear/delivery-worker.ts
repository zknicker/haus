import type { LinearDeliveryIgnoredReason } from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearWebhookDeliveriesTable, linearWorkspacesTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    type LinearDeliveryEffects,
    type LinearDeliveryHandler,
    type LinearDeliveryHandlers,
    type LinearDeliveryOutcome,
    type LinearDeliveryRow,
    type RawDeliveryRow,
    toDeliveryRow,
} from './delivery-handler.ts';
import { linearDeferralRecheckMs } from './loop-safety.ts';

/** After this many failed attempts a delivery is `failed` (poison) and never retried automatically. */
export const linearDeliveryMaxAttempts = 8;
const firstBackoffMs = 10_000;
const maxBackoffMs = 60 * 60 * 1000;
/** A claimed row is leased this long; a crash mid-route lets it run again after. */
const claimLeaseMs = 5 * 60 * 1000;
const batchSize = 10;
const lifecycleEvents = new Set(['OAuthApp', 'PermissionChange']);
const dataEvents = new Set(['Issue', 'Comment', 'Project', 'IssueLabel', 'WorkflowState']);

export interface LinearDeliveryWorkerDependencies {
    clock: { now(): Date };
    db: HausDatabase;
    handlers: LinearDeliveryHandlers;
    /** Wakes, DM announcements, and an outbox kick, after a routing commit. */
    onCommitted(effects: LinearDeliveryEffects): void;
    runtime: EffectRuntime<never>;
}

/**
 * Routes one batch of due deliveries (specs/linear-app.md#durable-ingest). A
 * row's effects and its `done` commit together, so a crash replays it exactly
 * once; a failure leaves it `queued` with backoff from 10 seconds to an hour,
 * and the eighth failure makes it `failed`, keeping its raw body.
 */
export async function runLinearDeliveryBatch(
    dependencies: LinearDeliveryWorkerDependencies
): Promise<{ more: boolean }> {
    const now = dependencies.clock.now();
    const rows = (await dependencies.db.execute(sql`
        update linear_webhook_deliveries
        set state = 'processing',
            next_attempt_at = ${new Date(now.getTime() + claimLeaseMs).toISOString()}::timestamptz
        where id in (
            select id from linear_webhook_deliveries
            where state in ('queued', 'processing')
              and next_attempt_at <= ${now.toISOString()}::timestamptz
            order by next_attempt_at
            limit ${batchSize}
            for update skip locked
        )
        returning id, delivery_id, receiver, event, action, server_id, workspace_id, body,
                  attempts, deferred_since, webhook_timestamp, received_at
    `)) as unknown as RawDeliveryRow[];
    for (const raw of rows) {
        await routeRow(dependencies, toDeliveryRow(raw));
    }
    return { more: rows.length === batchSize };
}

async function routeRow(dependencies: LinearDeliveryWorkerDependencies, row: LinearDeliveryRow) {
    const started = Date.now();
    try {
        const handler = await chooseHandler(dependencies, row);
        if (handler.kind === 'ignored') {
            await finish(dependencies.db, row, handler, dependencies.clock.now());
            await logOutcome(dependencies, row, `ignored:${handler.reason}`, started);
            return;
        }
        const prepared = await handler.handler.prepare?.(row);
        const now = dependencies.clock.now();
        const outcome = await applyRolledBackOnDefer(dependencies.db, row, now, (tx) =>
            handler.handler.apply(tx, row, now, prepared)
        );
        if (outcome.kind === 'done') {
            dependencies.onCommitted({ announce: outcome.announce, wakes: outcome.wakes });
        }
        await logOutcome(dependencies, row, outcome.kind, started);
    } catch (error) {
        await recordFailure(dependencies, row, error);
    }
}

/**
 * Runs `apply` under the Server lock and commits it with the row's outcome. A
 * deferral rolls back whatever `apply` wrote, so a recheck never doubles it.
 */
async function applyRolledBackOnDefer(
    db: HausDatabase,
    row: LinearDeliveryRow,
    now: Date,
    apply: (tx: HausDatabase) => Promise<LinearDeliveryOutcome>
): Promise<LinearDeliveryOutcome> {
    try {
        return await db.transaction(async (tx) => {
            await lockServerRow(tx, row.serverId);
            const result = await apply(tx);
            if (result.kind === 'defer') {
                throw new DeferredDelivery();
            }
            await finish(tx, row, result, now);
            return result;
        });
    } catch (error) {
        if (!(error instanceof DeferredDelivery)) {
            throw error;
        }
        const deferred = { kind: 'defer' } as const;
        await finish(db, row, deferred, now);
        return deferred;
    }
}

class DeferredDelivery extends Error {
    constructor() {
        super('A pending ledger candidate deferred this delivery.');
        this.name = 'DeferredDelivery';
    }
}

async function chooseHandler(
    dependencies: LinearDeliveryWorkerDependencies,
    row: LinearDeliveryRow
): Promise<
    | { handler: LinearDeliveryHandler; kind: 'route' }
    | { kind: 'ignored'; reason: LinearDeliveryIgnoredReason }
> {
    const [workspace] = await dependencies.db
        .select({ status: linearWorkspacesTable.status })
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, row.workspaceId))
        .limit(1);
    const lifecycle = lifecycleEvents.has(row.event);
    const live = lifecycle
        ? workspace !== undefined && workspace.status !== 'removed'
        : workspace?.status === 'active' || workspace?.status === 'refresh_required';
    if (!live) {
        return { kind: 'ignored', reason: 'workspace_inactive' };
    }
    if (lifecycle) {
        return { handler: dependencies.handlers.lifecycle, kind: 'route' };
    }
    if (row.event === 'AgentSessionEvent') {
        return { handler: dependencies.handlers.session, kind: 'route' };
    }
    if (dataEvents.has(row.event)) {
        return { handler: dependencies.handlers.dataChange, kind: 'route' };
    }
    return { kind: 'ignored', reason: 'unsupported_event' };
}

async function finish(
    db: HausDatabase,
    row: LinearDeliveryRow,
    outcome: LinearDeliveryOutcome,
    now: Date
) {
    const where = eq(linearWebhookDeliveriesTable.id, row.id);
    if (outcome.kind === 'defer') {
        await db
            .update(linearWebhookDeliveriesTable)
            .set({
                deferredSince: row.deferredSince ?? now,
                nextAttemptAt: new Date(now.getTime() + linearDeferralRecheckMs),
                state: 'queued',
            })
            .where(where);
        return;
    }
    await db
        .update(linearWebhookDeliveriesTable)
        .set({
            body: null,
            ignoredReason: outcome.kind === 'ignored' ? outcome.reason : null,
            processedAt: now,
            routedCount: outcome.kind === 'done' ? outcome.routed : 0,
            state: outcome.kind,
        })
        .where(where);
}

async function recordFailure(
    dependencies: LinearDeliveryWorkerDependencies,
    row: LinearDeliveryRow,
    error: unknown
) {
    const attempts = row.attempts + 1;
    const now = dependencies.clock.now();
    const poisoned = attempts >= linearDeliveryMaxAttempts;
    const backoff = Math.min(firstBackoffMs * 2 ** (attempts - 1), maxBackoffMs);
    await dependencies.db
        .update(linearWebhookDeliveriesTable)
        .set({
            attempts,
            nextAttemptAt: new Date(now.getTime() + backoff),
            processedAt: poisoned ? now : null,
            state: poisoned ? 'failed' : 'queued',
        })
        .where(eq(linearWebhookDeliveriesTable.id, row.id));
    const log = poisoned
        ? Effect.logError('linear.delivery_poisoned')
        : Effect.logWarning('linear.delivery_retry');
    await settle(
        dependencies.runtime,
        log.pipe(
            Effect.annotateLogs({
                ...logFields(row),
                attempts,
                errorName: error instanceof Error ? error.name : 'unknown',
                operation: poisoned ? 'linear.delivery_poisoned' : 'linear.delivery_retry',
            })
        )
    );
}

/** Delivery id, event, action, receiver kind, latency, and outcome; never bodies. */
async function logOutcome(
    dependencies: LinearDeliveryWorkerDependencies,
    row: LinearDeliveryRow,
    outcome: string,
    started: number
) {
    await settle(
        dependencies.runtime,
        Effect.logInfo('linear.delivery_routed').pipe(
            Effect.annotateLogs({
                ...logFields(row),
                latencyMs: Date.now() - started,
                operation: 'linear.delivery_routed',
                outcome,
            })
        )
    );
}

function logFields(row: LinearDeliveryRow) {
    return {
        action: row.action ?? '',
        deliveryId: row.deliveryId,
        event: row.event,
        receiverKind: row.receiver === 'app' ? 'app' : 'identity',
    };
}
