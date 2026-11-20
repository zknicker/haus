import { isDeepStrictEqual } from 'node:util';
import type {
    RunnerConnectionCapacityFrame,
    RunnerConnectionCredentialFrame,
    RunnerConnectionStatusFrame,
    RunnerModelConnection,
} from '@haus/api';
import { and, eq, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { modelConnectionsTable, serversTable } from '../postgres/schema.ts';
import type { SecretsKey } from '../secrets/sealed-secret.ts';
import { openCredential, sealCredential } from './connection-credential.ts';
import { shownCapacity } from './read-model-connections.ts';

export async function readRunnerConnections(db: HausDatabase, key: SecretsKey) {
    const rows = await db
        .select({
            credentialVersion: modelConnectionsTable.credentialVersion,
            id: modelConnectionsTable.id,
            label: modelConnectionsTable.label,
            provider: modelConnectionsTable.provider,
            sealedCredential: modelConnectionsTable.sealedCredential,
            serverId: modelConnectionsTable.serverId,
            webSearch: modelConnectionsTable.webSearch,
        })
        .from(modelConnectionsTable)
        .innerJoin(serversTable, eq(serversTable.id, modelConnectionsTable.serverId))
        .where(and(isNull(serversTable.deletedAt), eq(modelConnectionsTable.enabled, true)))
        .orderBy(
            modelConnectionsTable.serverId,
            modelConnectionsTable.provider,
            modelConnectionsTable.position
        );
    const connections: RunnerModelConnection[] = [];
    for (const { sealedCredential, ...row } of rows) {
        try {
            connections.push({ ...row, credential: openCredential(key, sealedCredential) });
        } catch (error) {
            console.error(`[haus] model connection ${row.id} could not be opened`, error);
        }
    }
    return connections;
}

export async function storeRotatedCredential(
    db: HausDatabase,
    key: SecretsKey | null,
    frame: RunnerConnectionCredentialFrame
) {
    return await db.transaction(async (tx) => {
        const [row] = await tx
            .select({
                credentialVersion: modelConnectionsTable.credentialVersion,
                sealedCredential: modelConnectionsTable.sealedCredential,
                serverId: modelConnectionsTable.serverId,
            })
            .from(modelConnectionsTable)
            .where(eq(modelConnectionsTable.id, frame.connectionId))
            .for('update');
        if (!row) {
            return rotation('superseded', frame.baseVersion, null);
        }
        const stored = openCredential(key, row.sealedCredential);
        const refresh = stored.kind === 'oauth' ? stored.credential.refresh : null;
        if (refresh === frame.credential.refresh) {
            return rotation('stored', row.credentialVersion, row.serverId);
        }
        // WARNING: refresh tokens are single-use; storing a pair rotated from a stale refresh would strand the connection.
        if (refresh !== frame.previousRefresh) {
            return rotation('superseded', row.credentialVersion, row.serverId);
        }
        const credentialVersion = row.credentialVersion + 1;
        await tx
            .update(modelConnectionsTable)
            .set({
                credentialVersion,
                sealedCredential: sealCredential(key, {
                    credential: frame.credential,
                    kind: 'oauth',
                }),
                updatedAt: new Date(),
            })
            .where(eq(modelConnectionsTable.id, frame.connectionId));
        return rotation('stored', credentialVersion, row.serverId);
    });
}

export async function recordConnectionStatus(db: HausDatabase, frame: RunnerConnectionStatusFrame) {
    const detail = frame.detail ?? null;
    const [changed] = await db
        .update(modelConnectionsTable)
        .set({ status: frame.status, statusDetail: detail, updatedAt: new Date() })
        .where(
            and(
                eq(modelConnectionsTable.id, frame.connectionId),
                or(
                    ne(modelConnectionsTable.status, frame.status),
                    sql`${modelConnectionsTable.statusDetail} is distinct from ${detail}`
                )
            )
        )
        .returning({ serverId: modelConnectionsTable.serverId });
    return changed?.serverId ?? null;
}

export async function recordConnectionCapacity(
    db: HausDatabase,
    frame: RunnerConnectionCapacityFrame
) {
    const readAt = new Date(frame.readAt);
    return await db.transaction(async (tx) => {
        const [row] = await tx
            .select({
                capacity: modelConnectionsTable.capacity,
                capacityReadAt: modelConnectionsTable.capacityReadAt,
                serverId: modelConnectionsTable.serverId,
            })
            .from(modelConnectionsTable)
            .where(
                and(
                    eq(modelConnectionsTable.id, frame.connectionId),
                    eq(modelConnectionsTable.credentialVersion, frame.credentialVersion),
                    or(
                        isNull(modelConnectionsTable.capacityReadAt),
                        lte(modelConnectionsTable.capacityReadAt, readAt)
                    )
                )
            )
            .for('update');
        if (!row) {
            return null;
        }
        await tx
            .update(modelConnectionsTable)
            .set({ capacity: sql`${sql.param(frame.windows)}::jsonb`, capacityReadAt: readAt })
            .where(eq(modelConnectionsTable.id, frame.connectionId));
        const at = Date.now();
        const shown = shownCapacity(frame.windows, readAt, at);
        return isDeepStrictEqual(shownCapacity(row.capacity, row.capacityReadAt, at), shown)
            ? null
            : row.serverId;
    });
}

function rotation(
    result: 'stored' | 'superseded',
    credentialVersion: number,
    serverId: string | null
) {
    return { credentialVersion, result, serverId };
}
