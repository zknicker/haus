import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearTriggerConfigsTable } from '../postgres/schema.ts';
import { recordTriggerFire } from '../triggers/trigger-fire.ts';
import type { TriggerRateLimiter } from '../triggers/trigger-rate-limit.ts';
import { workspaceCredentialId } from './agent-label-reads.ts';
import type {
    LinearDeliveryHandler,
    LinearDeliveryOutcome,
    LinearDeliveryRow,
} from './delivery-handler.ts';
import { field, type Payload, text } from './delivery-payload.ts';
import { readCommentIssue } from './event-projection/comment-issue-read.ts';
import {
    type LinearCommentIssueRead,
    linearTriggerEvent,
    serializeLinearProjection,
} from './event-projection/project.ts';
import type { LinearProjection } from './event-projection/types.ts';
import { linearEnvelopeLines } from './trigger-envelope.ts';
import { matchLinearTrigger } from './trigger-matching.ts';
import { syncLinearTriggerProblems } from './trigger-problem-sync.ts';
import {
    armedLinearTriggers,
    commentIssueId,
    commentIssueNeeded,
    type LinearTriggerCandidate,
    projectForMatching,
} from './trigger-projection.ts';

// `linear` Trigger matching and fires on the delivery worker
// (specs/linear-triggers.md): the `triggers` hook of the data-change handler.

export interface LinearTriggerDeliveryDependencies {
    accessToken(credentialId: string): Promise<string>;
    db: HausDatabase;
    delivery: Pick<AgentDelivery, 'enqueue'>;
    fetch: typeof fetch;
    limiter: TriggerRateLimiter;
}

/** Deliveries of objects a Trigger can name; a `remove` makes the reference unavailable. */
const referenceEvents = new Set(['IssueLabel', 'Project', 'WorkflowState']);

/**
 * The Trigger hook. `prepare` reads a comment's issue with the workspace token
 * before the transaction when some Trigger listens to comments; a failed read
 * throws, so the delivery retries. `apply` correlates, projects once, matches
 * every armed Trigger, and fires inside the routing transaction.
 */
export function linearTriggerHandler(
    dependencies: LinearTriggerDeliveryDependencies
): LinearDeliveryHandler<LinearCommentIssueRead | null> {
    return {
        apply: async (tx, row, now, prepared) => {
            const removed = await referenceRemoved(tx, row, now);
            const fired = await matchAndFire(dependencies, tx, row, now, prepared ?? null);
            if (fired.kind !== 'done') {
                return fired;
            }
            return { ...fired, wakes: dedupeWakes([...removed, ...fired.wakes]) };
        },
        prepare: async (row) => {
            if (row.event !== 'Comment') {
                return null;
            }
            const candidates = await armedLinearTriggers(dependencies.db, row);
            const issueId = commentIssueId(row.body);
            if (!(issueId && commentIssueNeeded(candidates))) {
                return null;
            }
            return await readCommentIssueFor(dependencies, row.workspaceId, issueId);
        },
    };
}

/** The issue behind a comment, read with the workspace actor's token. */
export async function readCommentIssueFor(
    dependencies: Pick<LinearTriggerDeliveryDependencies, 'accessToken' | 'db' | 'fetch'>,
    workspaceId: string,
    issueId: string
): Promise<LinearCommentIssueRead> {
    const credentialId = await workspaceCredentialId(dependencies.db, workspaceId);
    if (!credentialId) {
        throw new Error(
            `Linear workspace ${workspaceId} has no workspace credential to read with.`
        );
    }
    const token = await dependencies.accessToken(credentialId);
    return await readCommentIssue(dependencies.fetch, token, issueId);
}

async function matchAndFire(
    dependencies: LinearTriggerDeliveryDependencies,
    tx: HausDatabase,
    row: LinearDeliveryRow,
    now: Date,
    commentIssue: LinearCommentIssueRead | null
): Promise<LinearDeliveryOutcome> {
    const done = { announce: [], kind: 'done' as const, routed: 0, wakes: [] };
    const event = linearTriggerEvent(row.event);
    const candidates = event ? await armedLinearTriggers(tx, row) : [];
    if (!event || candidates.length === 0) {
        return done;
    }
    const input = await projectForMatching(tx, { ...row, commentIssue, event, now });
    if (input.kind !== 'projected') {
        return input.kind === 'defer' ? input : done;
    }
    const { entered, problems } = await syncLinearTriggerProblems(tx, {
        now,
        scope: { triggerIds: candidates.map((candidate) => candidate.triggerId) },
        serverId: row.serverId,
    });
    const wakes = entered.map((notice) => ({
        agentId: notice.ownerAgentId,
        serverId: row.serverId,
    }));
    const { admitted, selfSuppressed, suppressed } = classify(
        candidates.filter((candidate) => problems.get(candidate.triggerId) === null),
        input.projection,
        input.accessTeamIds,
        (triggerId) => dependencies.limiter.admit(triggerId, now.getTime()) === null
    );
    const linear = linearEnvelopeLines({
        deliveryId: row.deliveryId,
        projection: input.projection,
    });
    const payload = admitted.length > 0 ? serializeLinearProjection(input.projection) : '';
    let routed = 0;
    for (const triggerId of admitted) {
        const fire = await recordTriggerFire(
            tx,
            dependencies.delivery,
            {
                contentType: 'application/json',
                dedupeKey: `linear:${row.deliveryId}`,
                linear,
                payload,
                trigger: { id: triggerId, serverId: row.serverId },
            },
            now
        );
        if (fire.outcome.status === 'accepted' && fire.dispatch) {
            routed += 1;
            wakes.push(fire.dispatch);
        }
    }
    await countSuppressed(tx, row.serverId, now, { selfSuppressed, suppressed });
    return { ...done, routed, wakes: dedupeWakes(wakes) };
}

/**
 * Splits problem-free candidates into fires, rate-limited matches, and the
 * owner's own changes (self-suppression is always on).
 */
function classify(
    candidates: readonly LinearTriggerCandidate[],
    projection: LinearProjection,
    accessTeamIds: ReadonlySet<string>,
    admit: (triggerId: string) => boolean
) {
    const admitted: string[] = [];
    const suppressed: string[] = [];
    const selfSuppressed: string[] = [];
    for (const candidate of candidates) {
        const match = matchLinearTrigger(candidate.groups, projection, {
            accessTeamIds,
            ownerAgentId: candidate.ownerAgentId,
        });
        if (match.kind === 'own_change') {
            selfSuppressed.push(candidate.triggerId);
        } else if (match.kind === 'matched') {
            (admit(candidate.triggerId) ? admitted : suppressed).push(candidate.triggerId);
        }
    }
    return { admitted, selfSuppressed, suppressed };
}

/**
 * An `IssueLabel`, `WorkflowState`, or `Project` removal makes that id
 * unavailable to every Trigger on the workspace that names it.
 */
async function referenceRemoved(tx: HausDatabase, row: LinearDeliveryRow, now: Date) {
    if (!(referenceEvents.has(row.event) && isRemoval(row.body))) {
        return [];
    }
    const id = text(field(row.body, 'data'), 'id');
    if (!id) {
        return [];
    }
    const { entered } = await syncLinearTriggerProblems(tx, {
        now,
        references: { complete: false, unavailable: new Set([id]) },
        scope: { workspaceId: row.workspaceId },
        serverId: row.serverId,
    });
    return entered.map((notice) => ({ agentId: notice.ownerAgentId, serverId: row.serverId }));
}

/** Linear sends `remove`; an archive arrives as an update carrying `archivedAt`. */
function isRemoval(body: Payload): boolean {
    return text(body, 'action') === 'remove' || text(field(body, 'data'), 'archivedAt') !== null;
}

async function countSuppressed(
    tx: HausDatabase,
    serverId: string,
    now: Date,
    input: { selfSuppressed: string[]; suppressed: string[] }
) {
    const scoped = (ids: string[]) =>
        and(
            eq(linearTriggerConfigsTable.serverId, serverId),
            inArray(linearTriggerConfigsTable.triggerId, ids)
        );
    if (input.suppressed.length > 0) {
        await tx
            .update(linearTriggerConfigsTable)
            .set({
                lastSuppressedAt: now,
                suppressedCount: sql`${linearTriggerConfigsTable.suppressedCount} + 1`,
            })
            .where(scoped(input.suppressed));
    }
    if (input.selfSuppressed.length > 0) {
        await tx
            .update(linearTriggerConfigsTable)
            .set({
                selfSuppressedCount: sql`${linearTriggerConfigsTable.selfSuppressedCount} + 1`,
            })
            .where(scoped(input.selfSuppressed));
    }
}

/** One wake per owner, however many of its Triggers matched. */
function dedupeWakes(wakes: readonly { agentId: string; serverId: string }[]) {
    return [...new Map(wakes.map((wake) => [wake.agentId, wake])).values()];
}
