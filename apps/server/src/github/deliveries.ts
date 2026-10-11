import type { EffectRuntime } from '@haus/effect';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import type { TriggerRateLimiter } from '../triggers/trigger-rate-limit.ts';
import {
    type GithubDelivery,
    type GithubIngestDependencies,
    type GithubIngestOutcome,
    ingestGithubDelivery,
} from './delivery-ingest.ts';
import type { GithubApp } from './github-app.ts';
import { reconcileGithubInstallation } from './installation-reconcile.ts';
import { markGithubTriggersProblem } from './trigger-problems.ts';

export interface GithubDeliveryDependencies {
    clock?: { now(): Date };
    db: HausDatabase;
    delivery: AgentDelivery;
    githubApp: GithubApp | null;
    /** The same per-Trigger budget the webhook Trigger route spends. */
    limiter: TriggerRateLimiter;
    postCommitWork: ServerPostCommitWork;
    runtime: EffectRuntime<never>;
}

/**
 * The one ingest the webhook and recovery share, bound to the running
 * Server: lifecycle deliveries reconcile through the App, and problems found
 * at match are recorded with the shared problem writer.
 */
export function githubDeliveryIngest(
    dependencies: GithubDeliveryDependencies
): (delivery: GithubDelivery) => Promise<GithubIngestOutcome> {
    const clock = dependencies.clock ?? { now: () => new Date() };
    const { githubApp } = dependencies;
    const ingest: GithubIngestDependencies = {
        clock,
        db: dependencies.db,
        delivery: dependencies.delivery,
        limiter: dependencies.limiter,
        markProblem: markGithubTriggersProblem,
        postCommitWork: dependencies.postCommitWork,
        reconcile: async (input) => {
            if (!githubApp) {
                return;
            }
            const outcome = await reconcileGithubInstallation(
                {
                    app: githubApp.signer,
                    clock,
                    db: dependencies.db,
                    transport: githubApp.transport,
                },
                input
            );
            if (outcome.kind === 'reconciled' && outcome.entered.length > 0) {
                void dependencies.postCommitWork.wakeAgents(
                    dependencies.delivery,
                    outcome.entered.map((entered) => ({
                        agentId: entered.ownerAgentId,
                        serverId: outcome.serverId,
                    }))
                );
            }
        },
        runtime: dependencies.runtime,
    };
    return (delivery) => ingestGithubDelivery(ingest, delivery);
}
