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

const capacityShownMs = 6 * 60 * 60 * 1000;

const statusColumns = {
    authKind: modelConnectionsTable.authKind,
    capacity: modelConnectionsTable.capacity,
    capacityReadAt: modelConnectionsTable.capacityReadAt,
    id: modelConnectionsTable.id,
    label: modelConnectionsTable.label,
    position: modelConnectionsTable.position,
    provider: modelConnectionsTable.provider,
    status: modelConnectionsTable.status,
    statusDetail: modelConnectionsTable.statusDetail,
    updatedAt: modelConnectionsTable.updatedAt,
    webSearch: modelConnectionsTable.webSearch,
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

export function shownCapacity(
    capacity: ModelConnection['capacity'],
    readAt: Date | null,
    at: number
) {
    if (!(capacity && readAt) || at - readAt.getTime() > capacityShownMs) {
        return null;
    }
    return capacity.filter(
        (window) => window.resetsAt === null || Date.parse(window.resetsAt) > at
    );
}

function toModelConnection({
    capacity,
    capacityReadAt,
    ...row
}: {
    authKind: ModelConnection['authKind'];
    capacity: ModelConnection['capacity'];
    capacityReadAt: Date | null;
    id: string;
    label: string;
    position: number;
    provider: ModelConnection['provider'];
    status: ModelConnection['status'];
    statusDetail: string | null;
    updatedAt: Date;
    webSearch: boolean;
}) {
    const connection: ModelConnection = {
        ...row,
        capacity: shownCapacity(capacity, capacityReadAt, Date.now()),
        isDefault: row.position === 0,
        updatedAt: row.updatedAt.toISOString(),
    };
    return connection;
}
