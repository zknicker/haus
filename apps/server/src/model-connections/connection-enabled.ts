import type { ModelConnectionSetEnabledInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { modelConnectionsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readModelConnection, requireConnectionsOwner } from './read-model-connections.ts';

export async function setModelConnectionEnabled(
    db: HausDatabase,
    member: HausUser | null,
    input: ModelConnectionSetEnabledInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireConnectionsOwner(tx, member, input.serverId);
        await readModelConnection(tx, input.serverId, input.connectionId);
        await tx
            .update(modelConnectionsTable)
            .set({ enabled: input.enabled, updatedAt: new Date() })
            .where(
                and(
                    eq(modelConnectionsTable.serverId, input.serverId),
                    eq(modelConnectionsTable.id, input.connectionId)
                )
            );
        return await readModelConnection(tx, input.serverId, input.connectionId);
    });
}
