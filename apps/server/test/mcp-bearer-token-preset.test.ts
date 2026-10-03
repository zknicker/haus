import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createMcpPresetAccount, replaceMcpPresetToken } from '../src/server-mcp/presets.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import { disconnectMcpConnection } from '../src/server-mcp/service.ts';
import { listMcpConnections } from '../src/server-mcp/state.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { registerServerRuntime } from './test-computer-connections.ts';

const serverEffectRuntime = registerServerRuntime();
const token = 'AAAAAAAAAAAAAAAAAAAAAFixture%2BToken';
const noIcon = () => Promise.resolve(null);

let harness: HausServerHarness;
let connection: HausConnection;
let owner: HausClient;
let runtime: McpRuntime;
let member: { clerkUserId: string; id: string };
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('x-owner'));
    serverId = (await owner.trpc.server.create.mutate({ displayName: 'X', slug: 'x-preset' })).id;
    const [user] = (await harness.sql`
        select id from users where clerk_user_id = 'x-owner'
    `) as { id: string }[];
    member = { clerkUserId: 'x-owner', id: user?.id ?? '' };
    // Discovery never leaves the process: the fixture client stands in for api.x.com.
    runtime = new McpRuntime(connection.db, serverEffectRuntime, {
        clientFactory: () => Promise.resolve(makeClient('xmcp').client),
    });
});

afterAll(async () => {
    await runtime?.close();
    owner?.close();
    await connection?.close();
    await harness?.close();
});

test('X stores its token as a Server-only Authorization header', async () => {
    const created = await createMcpPresetAccount(connection.db, runtime, noIcon, member, {
        bearerToken: token,
        name: 'X',
        preset: 'x',
        serverId,
    });

    expect(created).toMatchObject({
        auth: 'headers',
        connected: true,
        headerNames: ['Authorization'],
        preset: 'x',
        tools: ['echo'],
        url: 'https://api.x.com/mcp',
    });
    const [secret] = (await harness.sql`
        select secret from mcp_secrets where connection_id = ${created.id}
    `) as { secret: { headers: Record<string, string> } }[];
    expect(secret?.secret.headers).toEqual({ Authorization: `Bearer ${token}` });
    const listed = await owner.trpc.mcp.list.query({ serverId });
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(JSON.stringify(await listMcpConnections(connection.db, member, serverId))).not.toContain(
        token
    );

    await replaceMcpPresetToken(connection.db, runtime, noIcon, member, {
        bearerToken: 'replacement-token',
        connectionId: created.id,
        serverId,
    });
    const [replaced] = (await harness.sql`
        select secret from mcp_secrets where connection_id = ${created.id}
    `) as { secret: { headers: Record<string, string> } }[];
    expect(replaced?.secret.headers).toEqual({ Authorization: 'Bearer replacement-token' });

    await disconnectMcpConnection(connection.db, runtime, member, {
        connectionId: created.id,
        serverId,
    });
    const [cleared] = (await harness.sql`
        select secret from mcp_secrets where connection_id = ${created.id}
    `) as { secret: { headers: Record<string, string> } }[];
    expect(cleared?.secret.headers).toEqual({});
});

test('the X preset rejects a missing token and arbitrary header edits', async () => {
    await expect(
        owner.trpc.mcp.addPresetAccount.mutate({
            name: 'X',
            preset: 'x',
            serverId,
        } as never)
    ).rejects.toThrow();
    await expect(
        owner.trpc.mcp.addPresetAccount.mutate({
            bearerToken: token,
            name: 'MerchBase',
            preset: 'merchbase',
            serverId,
        } as never)
    ).rejects.toThrow();

    const created = await createMcpPresetAccount(connection.db, runtime, noIcon, member, {
        bearerToken: token,
        name: 'X',
        preset: 'x',
        serverId,
    });
    await expect(
        owner.trpc.mcp.replaceHeaders.mutate({
            connectionId: created.id,
            headers: { Authorization: 'Bearer other' },
            serverId,
        })
    ).rejects.toThrow('token');

    const oauth = await owner.trpc.mcp.addPresetAccount.mutate({
        name: 'MerchBase',
        preset: 'merchbase',
        serverId,
    });
    await expect(
        owner.trpc.mcp.replacePresetToken.mutate({
            bearerToken: token,
            connectionId: oauth.id,
            serverId,
        })
    ).rejects.toThrow('bearer token');
});
