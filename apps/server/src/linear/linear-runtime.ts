import type { HausServerApplicationOptions } from '../haus-server-options.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { LinearApp } from './linear-api.ts';
import { LinearSignInRequiredError } from './linear-errors.ts';
import { createLinearPipeline, type LinearPipelineDependencies } from './linear-pipeline.ts';
import { linearUploadMeta, mintLinearAvatarUrl } from './signed-urls.ts';
import { LinearTeamCache } from './target-teams.ts';
import { LinearTokenRefresher } from './token-refresh.ts';
import { LinearToolTransport } from './tool-transport.ts';
import { createLinearWriteLedgerHooks } from './write-ledger.ts';

/**
 * The running Server's Linear pieces, created once: the configured Haus app
 * (or null), the single refresh owner, the team cache, and the per-call tool
 * transport the MCP runtime routes Linear invocations through.
 */
export interface LinearRuntime {
    app: LinearApp | null;
    /** Null without a configured app: nothing can refresh, so nothing reads Linear. */
    refresher: LinearTokenRefresher | null;
    teamCache: LinearTeamCache;
    transport: LinearToolTransport;
}

/**
 * The Server's Linear runtime plus its webhook pipeline, sharing the one
 * refresh owner. `workers` is absent when nothing can bind or deliver.
 */
export function createLinearServices(
    options: Pick<
        HausServerApplicationOptions,
        | 'appOrigin'
        | 'linearApp'
        | 'linearOutboxTransport'
        | 'linearUrlSigningKey'
        | 'linearWebhookSecrets'
    >,
    dependencies: Pick<
        LinearPipelineDependencies,
        'agentDelivery' | 'db' | 'postCommitWork' | 'runtime'
    >
) {
    const app = options.linearApp ?? null;
    const appWebhookSecrets = options.linearWebhookSecrets ?? [];
    const linear = createLinearRuntime({
        app,
        db: dependencies.db,
        signingKey: options.linearUrlSigningKey ?? null,
    });
    const { refresher } = linear;
    const pipeline = createLinearPipeline({
        ...dependencies,
        accessToken: async (credentialId) => {
            if (!refresher) {
                throw new LinearSignInRequiredError();
            }
            return (await refresher.fresh(credentialId, 60_000)).accessToken;
        },
        appClientId: app?.clientId ?? null,
        appOrigin: options.appOrigin,
        appWebhookSecrets,
        outboxTransport: options.linearOutboxTransport,
    });
    // Without the Haus Linear app nothing can bind, so nothing is queued to route.
    const configured = app !== null || appWebhookSecrets.length > 0;
    return { linear, webhook: pipeline.webhook, workers: configured ? pipeline.start : undefined };
}

export function createLinearRuntime(input: {
    app: LinearApp | null;
    clock?: { now(): Date };
    db: HausDatabase;
    /** `HAUS_LINEAR_URL_SIGNING_KEY`; without it there are no avatars or uploads. */
    signingKey: string | null;
}): LinearRuntime {
    const { app, db, signingKey } = input;
    const clock = input.clock ?? { now: () => new Date() };
    const teamCache = new LinearTeamCache();
    const refresher = app ? new LinearTokenRefresher({ app, clock, db }) : null;
    const signing = app && signingKey ? { origin: app.publicOrigin, signingKey } : null;
    return {
        app,
        refresher,
        teamCache,
        transport: new LinearToolTransport({
            app,
            avatarUrl: signing ? (agentId) => mintLinearAvatarUrl(signing, agentId) : undefined,
            cache: teamCache,
            clock,
            db,
            hooks: createLinearWriteLedgerHooks({
                db,
                extraMeta: async (write) =>
                    signing ? await linearUploadMeta(db, signing, write) : undefined,
            }),
            refresher,
        }),
    };
}
