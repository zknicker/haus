import {
    type ModelConnectionAddInput,
    type ModelConnectionCredential,
    type ModelConnectionRenameInput,
    type ModelConnectionTargetInput,
    type ModelProvider,
    providerSearchesWeb,
} from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, modelConnectionsTable } from '../postgres/schema.ts';
import type { SecretsKey } from '../secrets/sealed-secret.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { sealCredential } from './connection-credential.ts';
import {
    ModelConnectionLabelTakenError,
    ModelConnectionNotFoundError,
} from './model-connection-errors.ts';
import {
    listModelConnections,
    readModelConnection,
    requireConnectionsOwner,
} from './read-model-connections.ts';

const labelConstraint = 'model_connections_label_key';
const labelMaxLength = 80;

export async function addModelConnection(
    db: HausDatabase,
    member: HausUser | null,
    key: SecretsKey | null,
    input: ModelConnectionAddInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireConnectionsOwner(tx, member, input.serverId);
        const sealedCredential = sealCredential(key, input.credential);
        const position = (await providerOrder(tx, input.serverId, input.provider)).length;
        const id = createOpaqueId('mcn');
        try {
            await tx.insert(modelConnectionsTable).values({
                authKind: input.credential.kind,
                id,
                label: input.label,
                position,
                provider: input.provider,
                sealedCredential,
                serverId: input.serverId,
                webSearch: providerSearchesWeb(input.provider),
            });
        } catch (error) {
            throw violatesConstraint(error, labelConstraint)
                ? new ModelConnectionLabelTakenError(input.label)
                : error;
        }
        return await readModelConnection(tx, input.serverId, id);
    });
}

export async function renameModelConnection(
    db: HausDatabase,
    member: HausUser | null,
    input: ModelConnectionRenameInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireConnectionsOwner(tx, member, input.serverId);
        let renamed: { id: string }[];
        try {
            renamed = await tx
                .update(modelConnectionsTable)
                .set({ label: input.label, updatedAt: new Date() })
                .where(connectionWhere(input))
                .returning({ id: modelConnectionsTable.id });
        } catch (error) {
            throw violatesConstraint(error, labelConstraint)
                ? new ModelConnectionLabelTakenError(input.label)
                : error;
        }
        if (renamed.length === 0) {
            throw new ModelConnectionNotFoundError();
        }
        return await readModelConnection(tx, input.serverId, input.connectionId);
    });
}

export async function makeDefaultModelConnection(
    db: HausDatabase,
    member: HausUser | null,
    input: ModelConnectionTargetInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireConnectionsOwner(tx, member, input.serverId);
        const target = await readModelConnection(tx, input.serverId, input.connectionId);
        const order = await providerOrder(tx, input.serverId, target.provider);
        await renumber(tx, [target.id, ...order.filter((id) => id !== target.id)]);
        return { connections: await listModelConnections(tx, input.serverId) };
    });
}

export async function removeModelConnection(
    db: HausDatabase,
    member: HausUser | null,
    input: ModelConnectionTargetInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireConnectionsOwner(tx, member, input.serverId);
        const detached = await tx
            .select({ id: agentsTable.id })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.modelConnectionId, input.connectionId)
                )
            );
        const [removed] = await tx
            .delete(modelConnectionsTable)
            .where(connectionWhere(input))
            .returning({ provider: modelConnectionsTable.provider });
        if (!removed) {
            throw new ModelConnectionNotFoundError();
        }
        await renumber(tx, await providerOrder(tx, input.serverId, removed.provider));
        return {
            detachedAgentIds: detached.map((agent) => agent.id),
            list: { connections: await listModelConnections(tx, input.serverId) },
        };
    });
}

export async function insertSignedInConnection(
    db: HausDatabase,
    key: SecretsKey | null,
    input: {
        credential: Extract<ModelConnectionCredential, { kind: 'oauth' }>;
        label: string;
        provider: ModelProvider;
        serverId: string;
    }
) {
    const sealedCredential = sealCredential(key, input.credential);
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const taken = new Set(
            (
                await tx
                    .select({ label: modelConnectionsTable.label })
                    .from(modelConnectionsTable)
                    .where(providerWhere(input.serverId, input.provider))
            ).map((row) => row.label)
        );
        const id = createOpaqueId('mcn');
        await tx.insert(modelConnectionsTable).values({
            authKind: 'oauth',
            id,
            label: freeLabel(input.label, taken),
            position: taken.size,
            provider: input.provider,
            sealedCredential,
            serverId: input.serverId,
            webSearch: providerSearchesWeb(input.provider),
        });
        return id;
    });
}

async function providerOrder(
    tx: Pick<HausDatabase, 'select'>,
    serverId: string,
    provider: ModelProvider
) {
    const rows = await tx
        .select({ id: modelConnectionsTable.id })
        .from(modelConnectionsTable)
        .where(providerWhere(serverId, provider))
        .orderBy(asc(modelConnectionsTable.position), asc(modelConnectionsTable.createdAt));
    return rows.map((row) => row.id);
}

async function renumber(tx: Pick<HausDatabase, 'update'>, orderedIds: string[]) {
    for (const [position, id] of orderedIds.entries()) {
        await tx
            .update(modelConnectionsTable)
            .set({ position })
            .where(eq(modelConnectionsTable.id, id));
    }
}

function freeLabel(label: string, taken: Set<string>) {
    if (!taken.has(label)) {
        return label;
    }
    let suffix = 2;
    while (taken.has(numbered(label, suffix))) {
        suffix += 1;
    }
    return numbered(label, suffix);
}

function numbered(label: string, suffix: number) {
    const tail = ` ${suffix}`;
    return `${label.slice(0, labelMaxLength - tail.length).trimEnd()}${tail}`;
}

function connectionWhere(input: ModelConnectionTargetInput) {
    return and(
        eq(modelConnectionsTable.serverId, input.serverId),
        eq(modelConnectionsTable.id, input.connectionId)
    );
}

function providerWhere(serverId: string, provider: ModelProvider) {
    return and(
        eq(modelConnectionsTable.serverId, serverId),
        eq(modelConnectionsTable.provider, provider)
    );
}
