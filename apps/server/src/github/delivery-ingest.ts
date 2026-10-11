import type { GithubTriggerProblem } from '@haus/api';
import { type EffectRuntime, tracePromise } from '@haus/effect';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubTriggerConfigsTable, githubWebhookDeliveriesTable } from '../postgres/schema.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { recordTriggerFire } from '../triggers/trigger-fire.ts';
import type { TriggerRateLimiter } from '../triggers/trigger-rate-limit.ts';
import {
    type GithubIgnoredReason,
    type GithubTriggerMatch,
    matchGithubTriggers,
    routeGithubDelivery,
} from './delivery-routing.ts';
import { count, field, type Payload, text } from './event-projection/payload.ts';
import { projectGithubDelivery } from './event-projection/project.ts';
import { githubEnvelopeLines } from './trigger-envelope.ts';
import { triggerEventName } from './trigger-matching.ts';
import type { GithubTriggerProblemMark, markGithubTriggersProblem } from './trigger-problems.ts';

/** A `processing` claim older than this belongs to a crashed attempt and is retried. */
const staleClaimMs = 5 * 60 * 1000;
/** Lifecycle deliveries are signals for reconciliation, never routed to Triggers. */
const lifecycleEvents = new Set([
    'installation',
    'installation_repositories',
    'installation_target',
]);

export interface GithubDelivery {
    event: string;
    guid: string;
    payload: Payload;
    source: 'recovery' | 'webhook';
}

export type GithubIngestOutcome =
    | { kind: 'accepted'; routed: number }
    | { kind: 'duplicate' }
    /** Another attempt holds a fresh claim on this guid. */
    | { kind: 'in_progress' };

export interface GithubIngestDependencies {
    clock: { now(): Date };
    db: HausDatabase;
    delivery: AgentDelivery;
    limiter: TriggerRateLimiter;
    /** Slice B's `markGithubTriggersProblem`; tests may stand in for it. */
    markProblem: typeof markGithubTriggersProblem;
    postCommitWork: ServerPostCommitWork;
    /** Reconciles one installation from GitHub's answer (Slice B). */
    reconcile(input: { githubInstallationId: number }): Promise<unknown>;
    runtime: EffectRuntime<never>;
}

/**
 * Ingests one GitHub delivery, from the webhook or from recovery
 * (specs/github-triggers.md#ingest). The guid is claimed first so a redelivery
 * dedupes; every matching Trigger then fires in one transaction that also
 * marks the delivery done. A failure rolls all of it back and leaves the claim
 * for recovery to retry once it is stale.
 */
export async function ingestGithubDelivery(
    dependencies: GithubIngestDependencies,
    delivery: GithubDelivery
): Promise<GithubIngestOutcome> {
    return await tracePromise(
        dependencies.runtime,
        'haus.trigger.fire',
        {
            'haus.delivery.kind': `github.${delivery.source}.${delivery.event}`.slice(0, 80),
            'haus.operation': 'github.ingest',
        },
        () => ingest(dependencies, delivery),
        undefined,
        (outcome) => ({
            'haus.outcome': outcome.kind,
            ...(outcome.kind === 'accepted' ? { 'haus.message.count': outcome.routed } : {}),
        })
    );
}

async function ingest(
    dependencies: GithubIngestDependencies,
    delivery: GithubDelivery
): Promise<GithubIngestOutcome> {
    const { db } = dependencies;
    const now = dependencies.clock.now();
    const claim = await claimDelivery(db, delivery, now);
    if (claim !== 'claimed') {
        return { kind: claim };
    }
    if (delivery.event === 'ping') {
        return await finish(db, delivery.guid, { ignored: null, routed: 0 });
    }
    if (lifecycleEvents.has(delivery.event)) {
        const githubInstallationId = count(field(delivery.payload, 'installation'), 'id');
        if (githubInstallationId !== null) {
            await dependencies.reconcile({ githubInstallationId });
        }
        return await finish(db, delivery.guid, { ignored: null, routed: 0 });
    }
    const event = triggerEventName(delivery.event);
    if (!event) {
        return await finish(db, delivery.guid, { ignored: 'unsupported_event', routed: 0 });
    }
    // An unlocked look first, so an unbound installation never takes a Server lock.
    const preview = await routeGithubDelivery(db, delivery.payload);
    if (preview.kind === 'ignored') {
        return await finish(db, delivery.guid, { ignored: preview.ignored, routed: 0 });
    }
    const serverId = preview.installation.serverId;
    const github = githubEnvelopeLines({
        deliveryGuid: delivery.guid,
        event,
        payload: delivery.payload,
    });

    const committed = await db.transaction(async (tx) => {
        await lockServerRow(tx, serverId);
        // Every eligibility fact (installation status, access cache, connection,
        // grant, Trigger problem) is re-read behind the lock that grant,
        // disconnect, and installation changes also take, so none can commit
        // between this match and the fires below.
        const route = await routeGithubDelivery(tx, delivery.payload);
        if (route.kind === 'ignored' || route.installation.serverId !== serverId) {
            const ignored = route.kind === 'ignored' ? route.ignored : 'unknown_installation';
            await finish(tx, delivery.guid, { ignored, routed: 0 });
            return { routed: 0, wakes: [] };
        }
        const { installation } = route;
        const matched = await matchGithubTriggers(tx, {
            event,
            installation,
            now,
            payload: delivery.payload,
            repositoryId: route.repositoryId,
        });
        const admitted: GithubTriggerMatch[] = [];
        const suppressed: string[] = [];
        for (const match of matched.fire) {
            if (dependencies.limiter.admit(match.triggerId, now.getTime())) {
                suppressed.push(match.triggerId);
            } else {
                admitted.push(match);
            }
        }
        const projection =
            admitted.length > 0
                ? projectGithubDelivery({
                      event,
                      installationAccount: installation.accountLogin,
                      payload: delivery.payload,
                  })
                : null;
        const problems = [
            ...(await markProblem(
                tx,
                dependencies,
                serverId,
                'sign_in_required',
                matched.signInRequired,
                now
            )),
            ...(await markProblem(
                tx,
                dependencies,
                serverId,
                'agent_access_revoked',
                matched.accessRevoked,
                now
            )),
        ];
        const wakes: { agentId: string; serverId: string }[] = problems.map((entered) => ({
            agentId: entered.ownerAgentId,
            serverId,
        }));
        let routed = 0;
        for (const match of admitted) {
            const fire = await recordTriggerFire(
                tx,
                dependencies.delivery,
                {
                    contentType: 'application/json',
                    dedupeKey: `gh:${delivery.guid}`,
                    github,
                    payload: projection?.serialized ?? '',
                    trigger: { id: match.triggerId, serverId },
                },
                now
            );
            if (fire.outcome.status === 'accepted' && fire.dispatch) {
                routed += 1;
                wakes.push(fire.dispatch);
            }
        }
        if (suppressed.length > 0) {
            await tx
                .update(githubTriggerConfigsTable)
                .set({
                    lastSuppressedAt: now,
                    suppressedCount: sql`${githubTriggerConfigsTable.suppressedCount} + 1`,
                })
                .where(
                    and(
                        eq(githubTriggerConfigsTable.serverId, serverId),
                        inArray(githubTriggerConfigsTable.triggerId, suppressed)
                    )
                );
        }
        await finish(tx, delivery.guid, { ignored: null, routed });
        // One wake per owner, however many of its Triggers matched.
        return { routed, wakes: [...new Map(wakes.map((wake) => [wake.agentId, wake])).values()] };
    });
    if (committed.wakes.length > 0) {
        void dependencies.postCommitWork.wakeAgents(dependencies.delivery, committed.wakes);
    }
    return { kind: 'accepted', routed: committed.routed };
}

/**
 * Inserts the guid as `processing`, or takes over a claim abandoned for longer
 * than five minutes. A `done` row is a duplicate; a fresh claim is in flight.
 */
async function claimDelivery(
    db: HausDatabase,
    delivery: GithubDelivery,
    now: Date
): Promise<'claimed' | 'duplicate' | 'in_progress'> {
    const claimed = await db
        .insert(githubWebhookDeliveriesTable)
        .values({
            action: text(delivery.payload, 'action'),
            deliveryGuid: delivery.guid,
            event: delivery.event,
            installationId: count(field(delivery.payload, 'installation'), 'id'),
            receivedAt: now,
            source: delivery.source,
            state: 'processing',
        })
        .onConflictDoUpdate({
            set: { receivedAt: now, source: delivery.source },
            setWhere: and(
                eq(githubWebhookDeliveriesTable.state, 'processing'),
                lt(githubWebhookDeliveriesTable.receivedAt, new Date(now.getTime() - staleClaimMs))
            ),
            target: githubWebhookDeliveriesTable.deliveryGuid,
        })
        .returning({ guid: githubWebhookDeliveriesTable.deliveryGuid });
    if (claimed.length > 0) {
        return 'claimed';
    }
    const [existing] = await db
        .select({ state: githubWebhookDeliveriesTable.state })
        .from(githubWebhookDeliveriesTable)
        .where(eq(githubWebhookDeliveriesTable.deliveryGuid, delivery.guid))
        .limit(1);
    return existing?.state === 'done' ? 'duplicate' : 'in_progress';
}

async function finish(
    db: HausDatabase,
    guid: string,
    result: { ignored: GithubIgnoredReason | null; routed: number }
): Promise<GithubIngestOutcome> {
    await db
        .update(githubWebhookDeliveriesTable)
        .set({ ignoredReason: result.ignored, routedCount: result.routed, state: 'done' })
        .where(eq(githubWebhookDeliveriesTable.deliveryGuid, guid));
    return { kind: 'accepted', routed: result.routed };
}

async function markProblem(
    tx: HausDatabase,
    dependencies: GithubIngestDependencies,
    serverId: string,
    problem: GithubTriggerProblem,
    matches: readonly GithubTriggerMatch[],
    now: Date
) {
    if (matches.length === 0) {
        return [];
    }
    const mark: GithubTriggerProblemMark = {
        now,
        problem,
        scope: { triggerIds: matches.map((match) => match.triggerId) },
        serverId,
    };
    return (await dependencies.markProblem(tx, mark)).entered;
}
