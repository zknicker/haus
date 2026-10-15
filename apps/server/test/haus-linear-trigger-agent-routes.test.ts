import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    agentTriggerListSchema,
    agentTriggerResultSchema,
    linearTriggerPreviewResultSchema,
} from '@haus/api';
import { eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAgentTriggerRoutes } from '../src/agent-api/trigger-routes.ts';
import { ensureAgentDmRecord } from '../src/chats/ensure-agent-dm.ts';
import { mintRunnerCredential } from '../src/computers/runner-credentials.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentMcpConnectionGrantsTable,
    chatMessagesTable,
    computersTable,
    linearWorkspacesTable,
    mcpConnectionsTable,
} from '../src/postgres/schema.ts';
import { desTeamId } from './linear-session-seed.ts';
import { issueDelivery } from './linear-trigger-deliveries.ts';
import {
    authoringServices,
    fakeLinear,
    type LinearTriggerWorld,
    seedLinearTriggerWorld,
    states,
} from './linear-trigger-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// The Agent CLI's `linear` Trigger contract (`haus trigger create --kind
// linear`, `edit`, `preview`, `list`), over the Agent API routes.

let cluster: PostgresCluster;
let connection: HausConnection;
let world: LinearTriggerWorld;
let app: FastifyInstance;
let token: string;
let messageId: string;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    world = await seedLinearTriggerWorld(connection.db);
    const db = connection.db;
    const dm = await db.transaction((tx) =>
        ensureAgentDmRecord(tx, {
            agentId: world.agents.juniper,
            serverId: world.serverId,
            userId: world.binderUserId,
        })
    );
    messageId = 'msg_linear_anchor';
    await db.insert(chatMessagesTable).values({
        authorAgentId: world.agents.juniper,
        chatId: dm.id,
        content: 'Wake me when a design needs changes',
        id: messageId,
        nonce: 'linear-anchor',
        sequence: 1,
        serverId: world.serverId,
    });
    const [computer] = await db
        .select({ credentialHash: computersTable.credentialHash })
        .from(computersTable)
        .where(eq(computersTable.serverId, world.serverId));
    token = (
        await mintRunnerCredential(db, {
            agentId: world.agents.juniper,
            chatId: dm.id,
            credentialHash: computer?.credentialHash ?? '',
            runId: 'run_linear_triggers',
        })
    ).runnerToken;
    app = Fastify();
    registerAgentTriggerRoutes(app, db, authoringServices(db, fakeLinear(world)));
    await app.ready();
});

afterAll(async () => {
    await app?.close();
    await connection?.close();
    await cluster?.stop();
});

async function call(method: 'GET' | 'PATCH' | 'POST', url: string, payload?: unknown) {
    const response = await app.inject({
        headers: { authorization: `Bearer ${token}` },
        method,
        payload: payload as never,
        url,
    });
    return { body: response.json() as Record<string, unknown>, status: response.statusCode };
}

test('create, edit, preview, and list a Linear Trigger through the Agent routes', async () => {
    const created = await call('POST', '/api/agent/triggers', {
        kind: 'linear',
        linear: {
            workspace: 'Haus',
            groups: [
                {
                    actions: ['update'],
                    event: 'issue',
                    stateTo: ['Changes Requested'],
                    teams: ['DES'],
                },
            ],
        },
        messageId,
        title: 'Design needs changes',
    });
    expect(created.status).toBe(200);
    const trigger = agentTriggerResultSchema.parse(created.body).trigger;
    expect(trigger).toMatchObject({
        anchorMessageId: messageId,
        kind: 'linear',
        linear: {
            groups: [{ stateTo: [states.changesRequested], teams: [desTeamId] }],
            selfSuppressedCount: 0,
            suppressedCount: 0,
        },
        ownerAgentId: world.agents.juniper,
    });

    const edited = await call('PATCH', `/api/agent/triggers/${trigger.id}`, {
        linear: {
            groups: [
                { event: 'comment', onIssueDelegatedTo: ['@self'] },
                {
                    actions: ['update'],
                    event: 'issue',
                    stateTo: ['Changes Requested'],
                    teams: ['DES'],
                },
            ],
        },
    });
    expect(edited.status).toBe(200);
    expect(agentTriggerResultSchema.parse(edited.body).trigger).toMatchObject({
        linear: { groups: [{ event: 'comment' }, { event: 'issue' }] },
        version: trigger.version + 1,
    });

    const preview = await call('POST', `/api/agent/triggers/${trigger.id}/preview`, {
        payload: issueDelivery(world, {}),
    });
    expect(preview.status).toBe(200);
    expect(linearTriggerPreviewResultSchema.parse(preview.body)).toEqual({
        groups: [1],
        matched: true,
    });

    const listed = agentTriggerListSchema.parse((await call('GET', '/api/agent/triggers')).body);
    expect(listed.triggers.map((entry) => entry.kind)).toEqual(['linear']);
});

test('refusals are INVALID_ARG with the stable code first', async () => {
    const ambiguous = await call('POST', '/api/agent/triggers', {
        kind: 'linear',
        linear: {
            groups: [{ event: 'issue', stateTo: ['Design Review'] }],
        },
        messageId,
        title: 'Ambiguous',
    });
    expect(ambiguous.status).toBe(400);
    expect(ambiguous.body).toMatchObject({ code: 'INVALID_ARG' });
    expect(String(ambiguous.body.message)).toStartWith('linear_reference_ambiguous:');

    const [first] = agentTriggerListSchema.parse(
        (await call('GET', '/api/agent/triggers')).body
    ).triggers;
    const githubPreview = await call('POST', `/api/agent/triggers/${first?.id}/preview`, {
        event: 'push',
        payload: {},
    });
    expect(githubPreview.status).toBe(400);
    expect(String(githubPreview.body.message)).toStartWith('trigger_kind_mismatch:');
    const rotate = await call('POST', `/api/agent/triggers/${first?.id}/rotate`);
    expect(String(rotate.body.message)).toStartWith('trigger_has_no_secret:');

    const malformed = await call('POST', '/api/agent/triggers', {
        kind: 'linear',
        linear: { groups: [{ event: 'issue_label' }] },
        messageId,
        title: 'No such event',
    });
    expect(malformed).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
});

test('the workspace url key resolves Server-side; several workspaces need one named', async () => {
    const db = connection.db;
    const [first] = await db
        .select({ urlKey: linearWorkspacesTable.urlKey })
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, world.workspaceId));
    const firstKey = first?.urlKey ?? '';
    const secondConnection = createOpaqueId('mcp');
    await db.insert(mcpConnectionsTable).values({
        auth: 'none',
        connected: true,
        headerNames: [],
        id: secondConnection,
        name: 'Globex',
        preset: 'linear',
        serverId: world.serverId,
        tools: [],
        url: 'https://hosted-mcp.haus.invalid/linear/mcp',
    });
    await db.insert(agentMcpConnectionGrantsTable).values({
        agentId: world.agents.juniper,
        connectionId: secondConnection,
        serverId: world.serverId,
    });
    await db.insert(linearWorkspacesTable).values({
        appUserId: 'app-user-globex',
        boundByUserId: world.binderUserId,
        connectionId: secondConnection,
        id: createOpaqueId('lnw'),
        name: 'Globex',
        organizationId: 'org-globex',
        serverId: world.serverId,
        status: 'active',
        urlKey: 'globex',
    });
    const groups = [{ actions: ['update'], event: 'issue', teams: ['DES'] }];
    const create = (linear: Record<string, unknown>) =>
        call('POST', '/api/agent/triggers', {
            kind: 'linear',
            linear: { groups, ...linear },
            messageId,
            title: 'Workspace choice',
        });

    const ambiguous = await create({});
    expect(ambiguous).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
    expect(String(ambiguous.body.message)).toStartWith('linear_workspace_ambiguous:');
    expect(String(ambiguous.body.message)).toContain([firstKey, 'globex'].sort().join(', '));

    const unknown = await create({ workspace: 'initech' });
    expect(String(unknown.body.message)).toStartWith('linear_workspace_unavailable:');
    expect(String(unknown.body.message)).toContain('globex');

    const named = await create({ workspace: firstKey.toUpperCase() });
    expect(named.status).toBe(200);
    const trigger = agentTriggerResultSchema.parse(named.body).trigger;
    expect(trigger).toMatchObject({ linear: { connectionId: world.connectionId } });

    // An edit naming no workspace keeps the Trigger's own, however many the Agent holds.
    const edited = await call('PATCH', `/api/agent/triggers/${trigger.id}`, {
        linear: { groups },
    });
    expect(edited.status).toBe(200);
    expect(agentTriggerResultSchema.parse(edited.body).trigger).toMatchObject({
        linear: { connectionId: world.connectionId },
    });
});
