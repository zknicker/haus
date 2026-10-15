import { type EffectRuntime, settle } from '@haus/effect';
import { Effect } from 'effect';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { BootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { type LinearDataChangeHooks, linearDataChangeHandler } from './data-change.ts';
import { ingestLinearDelivery, linearWebhookReceivers } from './delivery-ingest.ts';
import { runLinearDeliveryBatch } from './delivery-worker.ts';
import { linearLifecycleHandler } from './lifecycle-deliveries.ts';
import { type LinearOutboxTransport, linearHttpOutboxTransport } from './outbox-calls.ts';
import { runLinearOutboxBatch } from './outbox-worker.ts';
import { type LinearPoller, startLinearPoller } from './poller.ts';
import { linearSessionHandler } from './session-routing.ts';
import type { LinearWebhookRouteOptions } from './webhook-route.ts';

const pollIntervalMs = 2000;

export interface LinearPipelineDependencies {
    /** A valid access token per credential row: the binding slice's refresher. */
    accessToken(credentialId: string): Promise<string>;
    agentDelivery: AgentDelivery;
    /** The Haus app's client id (revokes of its own tokens); null when unconfigured. */
    appClientId: string | null;
    appOrigin: string;
    /** The Haus app's webhook secrets, current first; empty when unconfigured. */
    appWebhookSecrets: readonly string[];
    clock?: { now(): Date };
    db: HausDatabase;
    fetch?: typeof fetch;
    /** Data-delivery additions from the chips and Triggers slices. */
    hooks?: LinearDataChangeHooks;
    /** Test seam: Linear for the outbox. */
    outboxTransport?: LinearOutboxTransport;
    postCommitWork: ServerPostCommitWork;
    runtime: EffectRuntime<never>;
}

export interface LinearPipeline {
    /** Starts the delivery and outbox workers; `close` waits for batches in flight. */
    start(): BootSweep;
    webhook: LinearWebhookRouteOptions;
}

/**
 * Linear's inbound half bound to the running Server: the webhook persists
 * and kicks the delivery worker; routing commits kick the outbox worker,
 * publish DM announcements, and wake Agents.
 */
export function createLinearPipeline(dependencies: LinearPipelineDependencies): LinearPipeline {
    const clock = dependencies.clock ?? { now: () => new Date() };
    const fetchImpl = dependencies.fetch ?? fetch;
    const [appSecret, appSecretPrevious] = dependencies.appWebhookSecrets;
    let deliveries: LinearPoller | null = null;
    let outbox: LinearPoller | null = null;

    const webhook: LinearWebhookRouteOptions = {
        clock,
        ingest: async (delivery) => {
            const outcome = await ingestLinearDelivery(dependencies.db, delivery);
            if (outcome.kind === 'accepted' && outcome.queued) {
                deliveries?.kick();
            }
            await settle(
                dependencies.runtime,
                Effect.logInfo('linear.delivery_received').pipe(
                    Effect.annotateLogs({
                        action:
                            typeof delivery.payload.action === 'string'
                                ? delivery.payload.action
                                : '',
                        deliveryId: delivery.deliveryId,
                        event: delivery.event,
                        operation: 'linear.delivery_received',
                        outcome: outcome.kind,
                        receiverKind: outcome.receiverKind,
                    })
                )
            );
            return outcome;
        },
        receivers: linearWebhookReceivers(dependencies.db, {
            appSecret: appSecret ?? null,
            appSecretPrevious: appSecretPrevious ?? null,
            clock,
        }),
    };

    return {
        start: () => {
            deliveries = startLinearPoller({
                batch: () =>
                    runLinearDeliveryBatch({
                        clock,
                        db: dependencies.db,
                        handlers: {
                            dataChange: linearDataChangeHandler({
                                appOrigin: dependencies.appOrigin,
                                hooks: dependencies.hooks ?? {},
                            }),
                            lifecycle: linearLifecycleHandler({
                                accessToken: dependencies.accessToken,
                                db: dependencies.db,
                                fetch: fetchImpl,
                            }),
                            session: linearSessionHandler({ appOrigin: dependencies.appOrigin }),
                        },
                        onCommitted: (effects) => {
                            publishRealtime(effects.announce);
                            outbox?.kick();
                            if (effects.wakes.length > 0) {
                                void dependencies.postCommitWork.wakeAgents(
                                    dependencies.agentDelivery,
                                    effects.wakes
                                );
                            }
                        },
                        runtime: dependencies.runtime,
                    }),
                intervalMs: pollIntervalMs,
                name: 'Linear delivery worker',
            });
            outbox = startLinearPoller({
                batch: () =>
                    runLinearOutboxBatch({
                        clock,
                        credentials: { accessToken: dependencies.accessToken },
                        db: dependencies.db,
                        runtime: dependencies.runtime,
                        transport:
                            dependencies.outboxTransport ??
                            linearHttpOutboxTransport(dependencies.appClientId, fetchImpl),
                    }),
                intervalMs: pollIntervalMs,
                name: 'Linear outbox worker',
            });
            const started = { deliveries, outbox };
            return {
                close: async () => {
                    await Promise.all([started.deliveries.close(), started.outbox.close()]);
                },
            };
        },
        webhook,
    };
}
