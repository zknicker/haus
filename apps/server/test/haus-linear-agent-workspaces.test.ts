import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentLinearWorkspacesSchema } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAgentLinearRoutes } from '../src/agent-api/linear-routes.ts';
import { ensureAgentDmRecord } from '../src/chats/ensure-agent-dm.ts';
import { mintRunnerCredential } from '../src/computers/runner-credentials.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentMcpConnectionGrantsTable, computersTable } from '../src/postgres/schema.ts';
import { desTeamId, seedLinearIdentity } from './linear-session-seed.ts';
import {
    type LinearTriggerWorld,
    opsTeamId,
    seedLinearTriggerWorld,
} from './linear-trigger-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// `GET /api/agent/linear/workspaces`, behind `haus linear workspaces`.

let cluster: PostgresCluster;
let connection: HausConnection;
let world: LinearTriggerWorld;
let app: FastifyInstance;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    world = await seedLinearTriggerWorld(connection.db);
    app = Fastify();
    registerAgentLinearRoutes(app, { db: connection.db });
    await app.ready();
});

afterAll(async () => {
    await app?.close();
    await connection?.close();
    await cluster?.stop();
});

async function tokenFor(agentId: string): Promise<string> {
    const db = connection.db;
    const dm = await db.transaction((tx) =>
        ensureAgentDmRecord(tx, { agentId, serverId: world.serverId, userId: world.binderUserId })
    );
    const [computer] = await db
        .select({ credentialHash: computersTable.credentialHash })
        .from(computersTable)
        .where(eq(computersTable.serverId, world.serverId));
    const minted = await mintRunnerCredential(db, {
        agentId,
        chatId: dm.id,
        credentialHash: computer?.credentialHash ?? '',
        runId: `run_linear_workspaces_${agentId}`,
    });
    return minted.runnerToken;
}

async function list(token: string) {
    const response = await app.inject({
        headers: { authorization: `Bearer ${token}` },
        method: 'GET',
        url: '/api/agent/linear/workspaces',
    });
    return { body: response.json() as unknown, status: response.statusCode };
}

test('lists granted workspaces with connection id, teams, and identity', async () => {
    await seedLinearIdentity(connection.db, world, world.agents.juniper);
    const response = await list(await tokenFor(world.agents.juniper));
    expect(response.status).toBe(200);
    const { workspaces } = agentLinearWorkspacesSchema.parse(response.body);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({
        connectionId: world.connectionId,
        hasIdentity: true,
        id: world.workspaceId,
        name: 'Haus',
        status: 'active',
    });
    expect(workspaces[0]?.teams.map((team) => team.id).sort()).toEqual(
        [desTeamId, opsTeamId].sort()
    );
});

test('an Agent without its own identity sees hasIdentity false; no grant sees nothing', async () => {
    const beaconToken = await tokenFor(world.agents.beacon);
    const granted = agentLinearWorkspacesSchema.parse((await list(beaconToken)).body);
    expect(granted.workspaces.map((workspace) => workspace.hasIdentity)).toEqual([false]);

    await connection.db
        .delete(agentMcpConnectionGrantsTable)
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.agentId, world.agents.beacon),
                eq(agentMcpConnectionGrantsTable.connectionId, world.connectionId)
            )
        );
    const revoked = agentLinearWorkspacesSchema.parse((await list(beaconToken)).body);
    expect(revoked.workspaces).toEqual([]);
});

test('refuses a request without a runner credential', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/agent/linear/workspaces' });
    expect(response.statusCode).toBe(401);
});
