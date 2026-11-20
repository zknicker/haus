import type {
    DriveConflictAttention,
    DriveConflictFile,
    DrivePushOutcome,
    DriveRevision,
} from '@haus/api';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { AgentDelivery } from '../../agent-delivery/delivery.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import {
    agentsTable,
    drivePushesTable,
    drivePushOutcomesTable,
    serverMembershipsTable,
    usersTable,
} from '../../postgres/schema.ts';
import { type DriveCitationBinding, rebindPushCitations } from '../citations.ts';
import { driveConflictKey, queueDriveConflict } from '../conflict-item.ts';

type DrivePush = typeof drivePushesTable.$inferSelect;

export async function closePushIn(
    tx: HausDatabase,
    delivery: Pick<AgentDelivery, 'enqueue'>,
    push: DrivePush
) {
    const outcomes = await pushOutcomes(tx, push);
    const listed = await listConflicts(tx, push.serverId, outcomes);
    if (push.closedAt) {
        return { listed, wakes: [] };
    }
    await tx
        .update(drivePushesTable)
        .set({ closedAt: new Date() })
        .where(and(eq(drivePushesTable.serverId, push.serverId), eq(drivePushesTable.id, push.id)));
    const wakes =
        listed.length > 0
            ? [
                  await queueDriveConflict(tx, delivery, {
                      attention: {
                          files: listed,
                          id: driveConflictKey(push.id),
                          pushId: push.id,
                          writer: pushWriter(push),
                      },
                      recipientAgentId: push.agentId,
                      serverId: push.serverId,
                  }),
              ]
            : [];
    await rebindPushCitations(tx, {
        agentId: push.agentId,
        bindings: citationBindings(outcomes),
        pushId: push.id,
        serverId: push.serverId,
    });
    return { listed, wakes };
}

function pushWriter(push: DrivePush) {
    return (
        push.workerId && push.taskId
            ? {
                  agentId: push.agentId,
                  taskId: push.taskId,
                  type: 'worker',
                  workerId: push.workerId,
              }
            : { agentId: push.agentId, type: 'agent' }
    ) satisfies DriveConflictAttention['writer'];
}

async function pushOutcomes(tx: HausDatabase, push: DrivePush) {
    const rows = await tx
        .select({ outcome: drivePushOutcomesTable.outcome })
        .from(drivePushOutcomesTable)
        .where(
            and(
                eq(drivePushOutcomesTable.serverId, push.serverId),
                eq(drivePushOutcomesTable.pushId, push.id)
            )
        )
        .orderBy(asc(drivePushOutcomesTable.createdAt), asc(drivePushOutcomesTable.requestId));
    return rows.map((row) => row.outcome);
}

async function listConflicts(tx: HausDatabase, serverId: string, outcomes: DrivePushOutcome[]) {
    const conflicts = outcomes.flatMap((outcome) =>
        outcome.outcome === 'kept_both' ||
        outcome.outcome === 'kept_edit' ||
        outcome.outcome === 'refused'
            ? [outcome]
            : []
    );
    const handles = await authorHandles(
        tx,
        serverId,
        conflicts.flatMap((outcome) => (outcome.current ? [outcome.current] : []))
    );
    return conflicts.map((outcome) => {
        const { current } = outcome;
        return {
            copyPath: outcome.outcome === 'kept_both' ? outcome.copy.path : null,
            currentAuthorHandle: current ? (handles.get(authorKey(current)) ?? null) : null,
            currentRevisionId: current?.revision_id ?? null,
            outcome: outcome.outcome,
            path: outcome.path,
            reason: outcome.outcome === 'refused' ? outcome.code : outcome.reason,
        } satisfies DriveConflictFile;
    });
}

function citationBindings(outcomes: DrivePushOutcome[]) {
    const bindings = new Map<string, DriveCitationBinding>();
    for (const outcome of outcomes) {
        const bound = outcome.outcome === 'kept_both' ? outcome.copy : boundRevision(outcome);
        if (bound) {
            bindings.set(outcome.path, {
                artifactId: bound.artifact_id,
                revisionId: bound.revision_id,
            });
        }
    }
    return bindings;
}

function boundRevision(outcome: DrivePushOutcome) {
    switch (outcome.outcome) {
        case 'committed':
        case 'merged':
        case 'unchanged':
        case 'kept_edit':
            return outcome.current;
        default:
            return null;
    }
}

async function authorHandles(tx: HausDatabase, serverId: string, current: DriveRevision[]) {
    const agentIds = current.flatMap((revision) =>
        revision.author.type === 'user' ? [] : [revision.author.agent_id]
    );
    const userIds = current.flatMap((revision) =>
        revision.author.type === 'user' ? [revision.author.user_id] : []
    );
    const handles = new Map<string, string>();
    if (agentIds.length > 0) {
        const agents = await tx
            .select({ handle: agentsTable.handle, id: agentsTable.id })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, agentIds)));
        for (const agent of agents) {
            handles.set(`agent:${agent.id}`, agent.handle);
        }
    }
    if (userIds.length > 0) {
        const members = await tx
            .select({
                displayName: usersTable.displayName,
                handle: serverMembershipsTable.handle,
                id: usersTable.id,
            })
            .from(usersTable)
            .leftJoin(
                serverMembershipsTable,
                and(
                    eq(serverMembershipsTable.userId, usersTable.id),
                    eq(serverMembershipsTable.serverId, serverId),
                    isNull(serverMembershipsTable.revokedAt)
                )
            )
            .where(inArray(usersTable.id, userIds));
        for (const member of members) {
            handles.set(`user:${member.id}`, member.handle ?? member.displayName ?? member.id);
        }
    }
    return handles;
}

function authorKey(revision: DriveRevision) {
    return revision.author.type === 'user'
        ? `user:${revision.author.user_id}`
        : `agent:${revision.author.agent_id}`;
}
