import { type ModelConnection, modelProviderSchema } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { modelConnectionsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    ModelConnectionNotFoundError,
    ModelConnectionsDeniedError,
} from './model-connection-errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

const statusColumns = {
    authKind: modelConnectionsTable.authKind,
    id: modelConnectionsTable.id,
    label: modelConnectionsTable.label,
    position: modelConnectionsTable.position,
    provider: modelConnectionsTable.provider,
    status: modelConnectionsTable.status,
    statusDetail: modelConnectionsTable.statusDetail,
    updatedAt: modelConnectionsTable.updatedAt,
};

export async function readModelConnections(db: Reader, member: HausUser | null, serverId: string) {
    await requireServerMembership(db, member, serverId);
    return { connections: await listModelConnections(db, serverId) };
}

export async function listModelConnections(db: Reader, serverId: string) {
    const rows = await db
        .select(statusColumns)
        .from(modelConnectionsTable)
        .where(eq(modelConnectionsTable.serverId, serverId));
    const providerOrder = modelProviderSchema.options;
    return rows
        .sort(
            (left, right) =>
                providerOrder.indexOf(left.provider) - providerOrder.indexOf(right.provider) ||
                left.position - right.position
        )
        .map(toModelConnection);
}

export async function readModelConnection(db: Reader, serverId: string, connectionId: string) {
    const [row] = await db
        .select(statusColumns)
        .from(modelConnectionsTable)
        .where(
            and(
                eq(modelConnectionsTable.serverId, serverId),
                eq(modelConnectionsTable.id, connectionId)
            )
        )
        .limit(1);
    if (!row) {
        throw new ModelConnectionNotFoundError();
    }
    return toModelConnection(row);
}

export async function requireConnectionsOwner(
    db: Reader,
    member: HausUser | null,
    serverId: string
) {
    const server = await requireServerMembership(db, member, serverId);
    if (server.role !== 'owner') {
        throw new ModelConnectionsDeniedError();
    }
}

function toModelConnection(row: {
    authKind: ModelConnection['authKind'];
    id: string;
    label: string;
    position: number;
    provider: ModelConnection['provider'];
    status: ModelConnection['status'];
    statusDetail: string | null;
    updatedAt: Date;
}) {
    const connection: ModelConnection = {
        ...row,
        isDefault: row.position === 0,
        updatedAt: row.updatedAt.toISOString(),
    };
    return connection;
}
