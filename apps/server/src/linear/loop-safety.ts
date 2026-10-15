import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    linearCredentialsTable,
    linearIdentitiesTable,
    linearWorkspacesTable,
    linearWritesTable,
} from '../postgres/schema.ts';

/** Haus-app ledger rows this long before a delivery's `updatedAt` may have caused it. */
export const linearCorrelationWindowMs = 60_000;
/** A pending candidate holds a delivery back at most this long. */
export const linearDeferralLimitMs = 30_000;
/** How soon a deferred delivery is looked at again. */
export const linearDeferralRecheckMs = 2000;

/** Which Agent caused a delivery, if any (specs/linear-app.md#loop-safety). */
export type LinearDeliveryCause =
    /** `exact`: an identity's own write, or an entity a ledger create derived. */
    | { agentId: string; exact: boolean; kind: 'agent' }
    /** A person, or an ambiguous Haus-app write: it fires. */
    | { kind: 'none' }
    /** A pending Haus-app candidate is still in flight: look again shortly. */
    | { kind: 'defer' };

export interface LinearDeliveryFacts {
    /** The payload's `actor.id` (or the session's creator), when Linear names one. */
    actorId: string | null;
    /** When the change happened: `data.updatedAt`, else the webhook timestamp. */
    changedAt: Date;
    /** When a pending candidate first deferred this delivery; null when it has not. */
    deferredSince: Date | null;
    /** The entity the delivery is about (issue, comment, project, ...). */
    entityId: string;
    now: Date;
    workspaceId: string;
}

/**
 * Correlates one delivery with the write ledger. Identity writes and created
 * entities are exact. A Haus-app update is best-effort: the Agent is named
 * only when every workspace-actor candidate on the entity inside the window
 * belongs to it; several Agents or none mean no Agent actor, so the delivery
 * fires rather than being suppressed.
 */
export async function correlateLinearDelivery(
    db: HausDatabase,
    facts: LinearDeliveryFacts
): Promise<LinearDeliveryCause> {
    const [workspace] = await db
        .select({ appUserId: linearWorkspacesTable.appUserId })
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, facts.workspaceId))
        .limit(1);
    if (!workspace) {
        return { kind: 'none' };
    }
    if (facts.actorId !== null && facts.actorId !== workspace.appUserId) {
        const identityAgent = await identityAgentFor(db, facts.workspaceId, facts.actorId);
        if (identityAgent) {
            return { agentId: identityAgent, exact: true, kind: 'agent' };
        }
    }
    const creator = await createdEntityAgent(db, facts);
    if (creator) {
        return { agentId: creator, exact: true, kind: 'agent' };
    }
    if (facts.actorId !== workspace.appUserId) {
        return { kind: 'none' };
    }
    return await hausAppCandidates(db, facts);
}

async function identityAgentFor(
    db: HausDatabase,
    workspaceId: string,
    appUserId: string
): Promise<string | null> {
    const [identity] = await db
        .select({ agentId: linearIdentitiesTable.agentId })
        .from(linearIdentitiesTable)
        .where(
            and(
                eq(linearIdentitiesTable.workspaceId, workspaceId),
                eq(linearIdentitiesTable.appUserId, appUserId),
                ne(linearIdentitiesTable.status, 'removed')
            )
        )
        .limit(1);
    return identity?.agentId ?? null;
}

async function createdEntityAgent(
    db: HausDatabase,
    facts: LinearDeliveryFacts
): Promise<string | null> {
    const [created] = await db
        .select({ agentId: linearWritesTable.agentId })
        .from(linearWritesTable)
        .where(
            and(
                eq(linearWritesTable.workspaceId, facts.workspaceId),
                sql`${linearWritesTable.clientEntityId}::text = ${facts.entityId}`,
                ne(linearWritesTable.status, 'failed')
            )
        )
        .limit(1);
    return created?.agentId ?? null;
}

async function hausAppCandidates(
    db: HausDatabase,
    facts: LinearDeliveryFacts
): Promise<LinearDeliveryCause> {
    const workspaceCredentials = db
        .select({ id: linearCredentialsTable.id })
        .from(linearCredentialsTable)
        .where(
            and(
                eq(linearCredentialsTable.workspaceId, facts.workspaceId),
                isNull(linearCredentialsTable.identityId)
            )
        );
    const candidates = await db
        .select({ agentId: linearWritesTable.agentId, status: linearWritesTable.status })
        .from(linearWritesTable)
        .where(
            and(
                eq(linearWritesTable.workspaceId, facts.workspaceId),
                or(
                    eq(linearWritesTable.targetId, facts.entityId),
                    eq(linearWritesTable.resultEntityId, facts.entityId)
                ),
                inArray(linearWritesTable.credentialId, workspaceCredentials),
                ne(linearWritesTable.status, 'failed'),
                gte(
                    linearWritesTable.createdAt,
                    new Date(facts.changedAt.getTime() - linearCorrelationWindowMs)
                ),
                lte(linearWritesTable.createdAt, facts.changedAt)
            )
        );
    const deferredFor = facts.now.getTime() - (facts.deferredSince ?? facts.now).getTime();
    if (
        candidates.some((candidate) => candidate.status === 'pending') &&
        deferredFor < linearDeferralLimitMs
    ) {
        return { kind: 'defer' };
    }
    const agents = new Set(candidates.map((candidate) => candidate.agentId));
    const [only] = agents;
    return agents.size === 1 && only !== undefined
        ? { agentId: only, exact: false, kind: 'agent' }
        : { kind: 'none' };
}
