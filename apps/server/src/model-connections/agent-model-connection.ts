import { type ModelConnectionAssignAgentInput, modelProviderFor } from '@haus/api';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, modelConnectionsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    ModelConnectionMismatchError,
    ModelConnectionsDeniedError,
} from './model-connection-errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function resolveModelConnection(
    db: Reader,
    input: { agentId: string; modelId: string; serverId: string }
) {
    const provider = modelProviderFor(input.modelId);
    const [chosen] = await db
        .select({ id: modelConnectionsTable.id })
        .from(agentsTable)
        .innerJoin(
            modelConnectionsTable,
            and(
                eq(modelConnectionsTable.serverId, agentsTable.serverId),
                eq(modelConnectionsTable.id, agentsTable.modelConnectionId)
            )
        )
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.agentId),
                eq(modelConnectionsTable.provider, provider),
                eq(modelConnectionsTable.enabled, true)
            )
        )
        .limit(1);
    if (chosen) {
        return chosen.id;
    }
    const [fallback] = await db
        .select({ id: modelConnectionsTable.id })
        .from(modelConnectionsTable)
        .where(
            and(
                eq(modelConnectionsTable.serverId, input.serverId),
                eq(modelConnectionsTable.provider, provider),
                eq(modelConnectionsTable.enabled, true)
            )
        )
        .orderBy(asc(modelConnectionsTable.position), asc(modelConnectionsTable.createdAt))
        .limit(1);
    return fallback?.id ?? null;
}

export async function assignAgentModelConnection(
    db: HausDatabase,
    member: HausUser | null,
    input: ModelConnectionAssignAgentInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);
        if (server.role !== 'owner' && server.role !== 'admin') {
            throw new ModelConnectionsDeniedError(
                "Only a Server Owner or Admin can choose an Agent's connection."
            );
        }
        const [agent] = await tx
            .select({ modelId: agentsTable.desiredModelId })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.id, input.agentId),
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1);
        if (!agent) {
            throw new ModelConnectionMismatchError('That Agent is not on this Server.');
        }
        if (input.connectionId !== null) {
            await requireServingConnection(
                tx,
                { connectionId: input.connectionId, serverId: input.serverId },
                agent.modelId
            );
        }
        await tx
            .update(agentsTable)
            .set({ modelConnectionId: input.connectionId })
            .where(
                and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId))
            );
        return { agentId: input.agentId, modelConnectionId: input.connectionId };
    });
}

async function requireServingConnection(
    tx: Reader,
    input: { connectionId: string; serverId: string },
    modelId: string | null
) {
    const [connection] = await tx
        .select({ provider: modelConnectionsTable.provider })
        .from(modelConnectionsTable)
        .where(
            and(
                eq(modelConnectionsTable.serverId, input.serverId),
                eq(modelConnectionsTable.id, input.connectionId)
            )
        )
        .limit(1);
    if (!connection) {
        throw new ModelConnectionMismatchError('That connection is not on this Server.');
    }
    if (!modelId || connection.provider !== modelProviderFor(modelId)) {
        throw new ModelConnectionMismatchError(
            "That connection does not serve this Agent's model."
        );
    }
}
