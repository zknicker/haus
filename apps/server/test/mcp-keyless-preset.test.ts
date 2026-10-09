import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createMcpPresetAccount } from '../src/server-mcp/presets.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { registerServerRuntime } from './test-computer-connections.ts';

const serverEffectRuntime = registerServerRuntime();
let harness: HausServerHarness;
let connection: HausConnection;
let owner: HausClient;
let runtime: McpRuntime;
let member: { clerkUserId: string; id: string };
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('crypto-owner'));
    serverId = (await owner.trpc.server.create.mutate({ displayName: 'Crypto', slug: 'crypto' }))
        .id;
    const [user] = (await harness.sql`
        select id from users where clerk_user_id = 'crypto-owner'
    `) as { id: string }[];
    member = { clerkUserId: 'crypto-owner', id: user?.id ?? '' };
    runtime = new McpRuntime(connection.db, serverEffectRuntime, {
        clientFactory: () => Promise.resolve(makeClient('coingecko').client),
    });
});

afterAll(async () => {
    await runtime?.close();
    owner?.close();
    await connection?.close();
    await harness?.close();
});

test('CoinGecko discovers tools immediately without credentials or Agent grants', async () => {
    const created = await createMcpPresetAccount(
        connection.db,
        runtime,
        () => Promise.resolve(null),
        member,
        {
            name: 'CoinGecko',
            preset: 'coingecko',
            serverId,
        }
    );
    expect(created).toMatchObject({
        auth: 'none',
        connected: true,
        grants: [],
        headerNames: [],
        preset: 'coingecko',
        tools: ['echo'],
        url: 'https://mcp.api.coingecko.com/sse',
    });
    const [secret] = (await harness.sql`
        select secret from mcp_secrets where connection_id = ${created.id}
    `) as { secret: { headers: Record<string, string>; oauthScopes: string[] } }[];
    expect(secret?.secret.headers).toEqual({});
    expect(secret?.secret.oauthScopes).toEqual([]);
    expect(await owner.trpc.mcp.list.query({ serverId })).toEqual([
        expect.objectContaining({ id: created.id, connected: true }),
    ]);
    await owner.trpc.mcp.delete.mutate({ connectionId: created.id, serverId });
    expect(await owner.trpc.mcp.list.query({ serverId })).toEqual([]);
});
