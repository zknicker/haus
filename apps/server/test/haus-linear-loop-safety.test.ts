import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { correlateLinearDelivery } from '../src/linear/loop-safety.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { linearWritesTable } from '../src/postgres/schema.ts';
import {
    type LinearSessionWorld,
    seedLinearIdentity,
    seedLinearSessionWorld,
} from './linear-session-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Loop safety (specs/linear-app.md#loop-safety): exact for identity writes and
// created entities, best-effort for Haus-app updates, failing toward firing.

let cluster: PostgresCluster;
let connection: HausConnection;
let world: LinearSessionWorld;
const changedAt = new Date('2026-10-15T12:00:00.000Z');

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    world = await seedLinearSessionWorld(connection.db);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

async function ledgerWrite(input: {
    agentId: string;
    clientEntityId?: string;
    createdAt: Date;
    credentialId?: string;
    status: 'pending' | 'succeeded';
    targetId?: string;
}) {
    await connection.db.insert(linearWritesTable).values({
        agentId: input.agentId,
        clientEntityId: input.clientEntityId ?? null,
        completedAt: input.status === 'succeeded' ? input.createdAt : null,
        createdAt: input.createdAt,
        credentialId: input.credentialId ?? world.credentialId,
        fieldFingerprint: '0'.repeat(64),
        id: createOpaqueId('lnl'),
        opIndex: 0,
        requestId: randomUUID(),
        result: input.status === 'succeeded' ? { ok: true } : null,
        serverId: world.serverId,
        status: input.status,
        targetId: input.targetId ?? null,
        targetType: 'issue',
        tool: 'update_issue',
        workspaceId: world.workspaceId,
    });
}

function correlate(input: {
    actorId: string | null;
    entityId: string;
    now?: Date;
    deferredSince?: Date;
}) {
    return correlateLinearDelivery(connection.db, {
        actorId: input.actorId,
        changedAt,
        deferredSince: input.deferredSince ?? null,
        entityId: input.entityId,
        now: input.now ?? changedAt,
        workspaceId: world.workspaceId,
    });
}

test('an identity’s own write is exactly its Agent’s', async () => {
    const identity = await seedLinearIdentity(connection.db, world, world.agents.beacon);
    expect(await correlate({ actorId: identity.appUserId, entityId: 'issue-any' })).toEqual({
        agentId: world.agents.beacon,
        exact: true,
        kind: 'agent',
    });
});

test('an entity a ledger create derived is exactly its Agent’s, even pending', async () => {
    const entityId = randomUUID();
    await ledgerWrite({
        agentId: world.agents.juniper,
        clientEntityId: entityId,
        createdAt: new Date(changedAt.getTime() - 10 * 60_000),
        status: 'pending',
    });
    expect(await correlate({ actorId: 'human-1', entityId })).toEqual({
        agentId: world.agents.juniper,
        exact: true,
        kind: 'agent',
    });
});

test('a person’s change has no Agent actor', async () => {
    await ledgerWrite({
        agentId: world.agents.juniper,
        createdAt: new Date(changedAt.getTime() - 5000),
        status: 'succeeded',
        targetId: 'issue-person',
    });
    expect(await correlate({ actorId: 'human-1', entityId: 'issue-person' })).toEqual({
        kind: 'none',
    });
});

test('one Agent’s Haus-app write inside the window is that Agent’s; outside it is nobody’s', async () => {
    await ledgerWrite({
        agentId: world.agents.juniper,
        createdAt: new Date(changedAt.getTime() - 30_000),
        status: 'succeeded',
        targetId: 'issue-one',
    });
    await ledgerWrite({
        agentId: world.agents.beacon,
        createdAt: new Date(changedAt.getTime() - 61_000),
        status: 'succeeded',
        targetId: 'issue-one',
    });
    expect(await correlate({ actorId: world.workspaceAppUserId, entityId: 'issue-one' })).toEqual({
        agentId: world.agents.juniper,
        exact: false,
        kind: 'agent',
    });
    expect(await correlate({ actorId: world.workspaceAppUserId, entityId: 'issue-none' })).toEqual({
        kind: 'none',
    });
});

test('two Agents’ Haus-app writes inside the window fire rather than suppress', async () => {
    for (const agentId of [world.agents.juniper, world.agents.beacon]) {
        await ledgerWrite({
            agentId,
            createdAt: new Date(changedAt.getTime() - 20_000),
            status: 'succeeded',
            targetId: 'issue-two',
        });
    }
    expect(await correlate({ actorId: world.workspaceAppUserId, entityId: 'issue-two' })).toEqual({
        kind: 'none',
    });
});

test('a pending candidate defers for at most thirty seconds, then the rule applies', async () => {
    await ledgerWrite({
        agentId: world.agents.beacon,
        createdAt: new Date(changedAt.getTime() - 1000),
        status: 'pending',
        targetId: 'issue-pending',
    });
    const actorId = world.workspaceAppUserId;
    expect(await correlate({ actorId, entityId: 'issue-pending' })).toEqual({ kind: 'defer' });
    expect(
        await correlate({
            actorId,
            deferredSince: changedAt,
            entityId: 'issue-pending',
            now: new Date(changedAt.getTime() + 29_999),
        })
    ).toEqual({ kind: 'defer' });
    expect(
        await correlate({
            actorId,
            deferredSince: changedAt,
            entityId: 'issue-pending',
            now: new Date(changedAt.getTime() + 30_000),
        })
    ).toEqual({ agentId: world.agents.beacon, exact: false, kind: 'agent' });
});

test('an identity credential’s ledger rows are not Haus-app candidates', async () => {
    const identity = await seedLinearIdentity(connection.db, world, world.agents.juniper);
    await ledgerWrite({
        agentId: world.agents.juniper,
        createdAt: new Date(changedAt.getTime() - 1000),
        credentialId: identity.credentialId,
        status: 'succeeded',
        targetId: 'issue-identity',
    });
    expect(
        await correlate({ actorId: world.workspaceAppUserId, entityId: 'issue-identity' })
    ).toEqual({ kind: 'none' });
});
