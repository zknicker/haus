import type { TaskActor } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serversTable } from '../postgres/schema.ts';
import { requireServerMembership, ServerAccessDeniedError } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';

export type { TaskActor } from '@haus/api';

/**
 * The actor of a board or Task write. Every human member and every Agent of
 * the Server reads and writes every board (ADR 0051), so the only check is
 * standing on the Server: an active membership, or a non-retired Agent.
 */
export async function requireTaskActor(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    actor: TaskActor
): Promise<void> {
    if (actor.kind === 'user') {
        await requireServerMembership(db, { id: actor.userId }, serverId);
        return;
    }
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .innerJoin(serversTable, eq(serversTable.id, agentsTable.serverId))
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                eq(agentsTable.id, actor.agentId),
                isNull(agentsTable.retiredAt),
                isNull(serversTable.deletedAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new ServerAccessDeniedError();
    }
}

/** The signed-in person as a Task actor; a human with no Haus User is no member. */
export function memberTaskActor(member: HausUser | null): TaskActor {
    if (!member) {
        throw new ServerAccessDeniedError();
    }
    return { kind: 'user', userId: member.id };
}

export function creatorColumns(actor: TaskActor) {
    return actor.kind === 'user'
        ? { createdByAgentId: null, createdByUserId: actor.userId }
        : { createdByAgentId: actor.agentId, createdByUserId: null };
}

/** Reads a stored exactly-one-of user/agent pair; a row with neither fails the mapping. */
export function actorFromColumns(userId: string | null, agentId: string | null): TaskActor {
    if (userId !== null) {
        return { kind: 'user', userId };
    }
    if (agentId !== null) {
        return { agentId, kind: 'agent' };
    }
    throw new Error('A Task actor row names neither a person nor an Agent.');
}

/** A nullable stored user/agent pair: the assignee. */
export function optionalActorFromColumns(
    userId: string | null,
    agentId: string | null
): TaskActor | null {
    return userId === null && agentId === null ? null : actorFromColumns(userId, agentId);
}

export function sameTaskActor(left: TaskActor | null, right: TaskActor | null): boolean {
    if (left === null || right === null) {
        return left === right;
    }
    if (left.kind === 'user') {
        return right.kind === 'user' && right.userId === left.userId;
    }
    return right.kind === 'agent' && right.agentId === left.agentId;
}
