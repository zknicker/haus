import { afterAll, beforeAll, expect, test } from 'bun:test';
import { inspect } from 'node:util';
import { type LinearCallMeta, linearMetaKey } from '@haus/api/linear-actor-meta';
import { LinearTeamCache } from '../src/linear/target-teams.ts';
import { LinearTokenRefresher } from '../src/linear/token-refresh.ts';
import { LinearToolTransport } from '../src/linear/tool-transport.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import type { McpToolCall, McpToolResult } from '../src/server-mcp/tool-catalog.ts';
import { type Seed, seedAgent } from './agent-inbox-harness.ts';
import {
    acme,
    addAgent,
    createFakeLinear,
    type FakeLinear,
    grant,
    seedIdentity,
    seedWorkspace,
    teamDesign,
    teamOps,
} from './linear-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

// Per-request actor transport (specs/linear-app.md#per-request-actor-transport):
// the Server picks the actor per call, sends its token only in request `_meta`,
// never lets it out in results or errors, and answers a `401` with one forced
// refresh and an idempotent resend.

let cluster: PostgresCluster;
let connection: HausConnection;
let fake: FakeLinear;
let seed: Seed;
let workspace: Awaited<ReturnType<typeof seedWorkspace>>;
let beaconId: string;
let transport: LinearToolTransport;
const workspaceToken = 'lin_workspace_token_secret';
const identityToken = 'lin_identity_token_secret';

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    fake = createFakeLinear();
    const actor = { appUserId: 'app-haus', displayName: 'Haus', organization: acme, teams: [] };
    fake.tokens.set(workspaceToken, actor);
    seed = await seedAgent(connection.db);
    workspace = await seedWorkspace(connection.db, seed, {
        accessToken: workspaceToken,
        refreshToken: 'ref-workspace',
        teams: [teamDesign, teamOps],
    });
    fake.refreshTokens.set('ref-workspace', actor);
    await seedIdentity(connection.db, seed.serverId, {
        accessToken: identityToken,
        agentId: seed.agentId,
        appUserId: 'app-ada',
        teams: [teamDesign],
        workspaceId: workspace.workspaceId,
    });
    beaconId = await addAgent(connection.db, seed, 'Beacon');
    await grant(connection.db, seed.serverId, beaconId, workspace.connectionId);
    fake.entityTeams.set('DES-1', [teamDesign.id]);
    fake.entityTeams.set('OPS-1', [teamOps.id]);
    fake.entityTeams.set('project-both', [teamDesign.id, teamOps.id]);
    const clock = { now: () => new Date() };
    const app = { clientId: 'haus-client', fetch: fake.fetch, publicOrigin: 'https://haus.test' };
    transport = new LinearToolTransport({
        app,
        cache: new LinearTeamCache(),
        clock,
        db: connection.db,
        refresher: new LinearTokenRefresher({ app, clock, db: connection.db }),
    });
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

let requestCounter = 0;
function call(
    toolName: string,
    args: Record<string, unknown>,
    agentId = seed.agentId
): McpToolCall {
    requestCounter += 1;
    return {
        agentId,
        arguments: args,
        connectionId: workspace.connectionId,
        deadlineMs: 30_000,
        requestId: `00000000-0000-4000-8000-${String(requestCounter).padStart(12, '0')}`,
        serverId: seed.serverId,
        toolName,
    };
}

function recorder(answer: (meta: LinearCallMeta) => McpToolResult = okResult) {
    const sent: LinearCallMeta[] = [];
    const send = async (meta: Record<string, unknown>) => {
        const linear = meta[linearMetaKey] as LinearCallMeta;
        sent.push(linear);
        await Bun.sleep(5);
        return answer(linear);
    };
    return { send, sent };
}

function okResult(): McpToolResult {
    return {
        _meta: { [linearMetaKey]: { completed: true, mutations: [] } },
        content: [{ text: '{}', type: 'text' }],
    };
}

const text = (result: unknown) =>
    ((result as { content: { text: string }[] }).content[0]?.text ?? '') as string;

test('reads go through the workspace actor and result _meta never reaches Computer', async () => {
    const { send, sent } = recorder();
    const result = await transport.call(call('get_issue', { issue: 'DES-1' }), send);
    expect(sent[0]).toMatchObject({ accessToken: workspaceToken, actor: { kind: 'workspace' } });
    expect(result).not.toHaveProperty('_meta');
});

test('a write inside the identity teams uses the identity; one outside is refused, never the Haus app', async () => {
    const inside = recorder();
    await transport.call(call('create_comment', { issue: 'DES-1' }), inside.send);
    expect(inside.sent[0]).toMatchObject({
        accessToken: identityToken,
        actor: { appUserId: 'app-ada', createAsUser: null, kind: 'identity' },
    });
    const outside = recorder();
    const refused = await transport.call(call('create_comment', { issue: 'OPS-1' }), outside.send);
    expect(text(refused)).toBe(
        "linear_team_outside_access: Ada's Linear app can't reach Ops. A workspace admin can change its team access under Linear → Settings → Applications → Ada → Team access."
    );
    expect(outside.sent).toHaveLength(0);
});

test('an Agent without an identity writes through the Haus app with createAsUser', async () => {
    const { send, sent } = recorder();
    await transport.call(call('create_comment', { issue: 'OPS-1' }, beaconId), send);
    expect(sent[0]).toMatchObject({
        accessToken: workspaceToken,
        actor: { createAsUser: 'Beacon', kind: 'workspace' },
    });
});

test('a multi-team write never splits actors', async () => {
    const identity = recorder();
    const refused = await transport.call(
        call('create_project', { teams: ['DES', 'OPS'] }),
        identity.send
    );
    expect(text(refused)).toStartWith('linear_team_outside_access:');
    expect(identity.sent).toHaveLength(0);
    const { send, sent } = recorder();
    await transport.call(call('create_project', { teams: ['DES', 'OPS'] }, beaconId), send);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.actor.kind).toBe('workspace');
});

test('a write touching a team outside workspace access is refused before the connector', async () => {
    const { send, sent } = recorder();
    const result = await transport.call(call('create_issue', { team: 'SECRET' }), send);
    expect(text(result)).toStartWith('linear_team_outside_access:');
    expect(sent).toHaveLength(0);
});

test('two Agents invoking concurrently each carry their own actor and token', async () => {
    const { send, sent } = recorder();
    await Promise.all([
        transport.call(call('create_comment', { issue: 'DES-1' }), send),
        transport.call(call('create_comment', { issue: 'DES-1' }, beaconId), send),
        transport.call(call('create_comment', { issue: 'DES-1' }), send),
        transport.call(call('create_comment', { issue: 'DES-1' }, beaconId), send),
    ]);
    const byUser = new Map(
        sent.map((meta) => [meta.actor.createAsUser ?? meta.actor.appUserId, meta.accessToken])
    );
    expect(byUser.get('app-ada')).toBe(identityToken);
    expect(byUser.get('Beacon')).toBe(workspaceToken);
    expect(new Set(sent.map((meta) => meta.requestId)).size).toBe(4);
});

test('a 401 forces one refresh and resends the same request id and seed', async () => {
    let answered = 0;
    const { send, sent } = recorder(() => {
        answered += 1;
        return answered === 1
            ? {
                  content: [
                      { text: 'linear_token_rejected: Linear rejected the token.', type: 'text' },
                  ],
                  isError: true,
              }
            : okResult();
    });
    const result = await transport.call(call('get_issue', { issue: 'DES-1' }), send);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.accessToken).not.toBe(sent[0]?.accessToken);
    expect(sent[1]?.requestId).toBe(sent[0]?.requestId ?? '');
    expect(sent[1]?.idSeed).toBe(sent[0]?.idSeed ?? '');
    expect(fake.refreshCalls).toBe(1);
    expect((result as { isError?: boolean }).isError).toBeUndefined();
});

test('no token leaves through a thrown error or an echoing result', async () => {
    let leaked = '';
    const thrown = await transport
        .call(call('whoami', {}), async (meta) => {
            leaked = (meta[linearMetaKey] as LinearCallMeta).accessToken;
            throw new Error(`upstream failed with ${leaked}`, { cause: { meta } });
        })
        .catch((error: unknown) => error);
    expect(leaked).not.toBe('');
    expect(inspect(thrown, { depth: 8 })).not.toContain(leaked);
    const echoed = await transport.call(call('whoami', {}), async (meta) => ({
        content: [{ text: JSON.stringify(meta), type: 'text' }],
    }));
    expect(JSON.stringify(echoed)).not.toContain('lin_');
    expect(text(echoed)).toStartWith('linear_upstream_error:');
});

test('whoami answers as the identity and carries its handle', async () => {
    const { send, sent } = recorder();
    await transport.call(call('whoami', {}), send);
    expect(sent[0]).toMatchObject({
        actor: { kind: 'identity' },
        self: { identityHandle: 'app-ada' },
    });
});
