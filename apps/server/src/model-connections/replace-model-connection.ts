import type {
    ModelConnectionCredential,
    ModelConnectionReplaceCredentialInput,
    ModelProvider,
} from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { modelConnectionsTable } from '../postgres/schema.ts';
import type { SecretsKey } from '../secrets/sealed-secret.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { sealCredential } from './connection-credential.ts';
import {
    ModelConnectionMismatchError,
    ModelConnectionNotFoundError,
} from './model-connection-errors.ts';
import { readModelConnection, requireConnectionsOwner } from './read-model-connections.ts';

type Writer = Pick<HausDatabase, 'select' | 'update'>;

export async function replaceModelConnectionCredential(
    db: HausDatabase,
    member: HausUser | null,
    key: SecretsKey | null,
    input: ModelConnectionReplaceCredentialInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireConnectionsOwner(tx, member, input.serverId);
        const sealedCredential = sealCredential(key, input.credential);
        const target = await lockedConnection(tx, input.serverId, input.connectionId);
        if (target.authKind !== input.credential.kind) {
            throw new ModelConnectionMismatchError(
                `This connection takes ${authKindNames[target.authKind]}.`
            );
        }
        await storeReplacement(tx, input.connectionId, sealedCredential);
        return await readModelConnection(tx, input.serverId, input.connectionId);
    });
}

export async function requireSignInTarget(
    db: Pick<HausDatabase, 'select'>,
    input: { connectionId: string; provider: ModelProvider; serverId: string }
) {
    const target = await readModelConnection(db, input.serverId, input.connectionId);
    if (target.provider !== input.provider || target.authKind !== 'oauth') {
        throw new ModelConnectionMismatchError(
            'That connection does not sign in with this provider.'
        );
    }
}

export async function replaceSignedInCredential(
    db: HausDatabase,
    key: SecretsKey | null,
    input: {
        connectionId: string;
        credential: Extract<ModelConnectionCredential, { kind: 'oauth' }>;
        provider: ModelProvider;
        serverId: string;
    }
) {
    const sealedCredential = sealCredential(key, input.credential);
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const target = await lockedConnection(tx, input.serverId, input.connectionId);
        if (target.provider !== input.provider || target.authKind !== 'oauth') {
            throw new ModelConnectionMismatchError(
                'That connection does not sign in with this provider.'
            );
        }
        await storeReplacement(tx, input.connectionId, sealedCredential);
    });
}

async function lockedConnection(tx: Writer, serverId: string, connectionId: string) {
    const [row] = await tx
        .select({
            authKind: modelConnectionsTable.authKind,
            provider: modelConnectionsTable.provider,
        })
        .from(modelConnectionsTable)
        .where(
            and(
                eq(modelConnectionsTable.serverId, serverId),
                eq(modelConnectionsTable.id, connectionId)
            )
        )
        .for('update');
    if (!row) {
        throw new ModelConnectionNotFoundError();
    }
    return row;
}

async function storeReplacement(tx: Writer, connectionId: string, sealedCredential: unknown) {
    await tx
        .update(modelConnectionsTable)
        .set({
            credentialVersion: sql`${modelConnectionsTable.credentialVersion} + 1`,
            sealedCredential,
            status: 'ready',
            statusDetail: null,
            updatedAt: new Date(),
        })
        .where(eq(modelConnectionsTable.id, connectionId));
}

const authKindNames = {
    'api-key': 'an API key',
    oauth: 'a sign-in',
    'setup-token': 'a setup-token',
} as const;
