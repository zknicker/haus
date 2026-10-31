import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createMcpPresetAccount } from '../src/server-mcp/presets.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const serverEffectRuntime = makeServerRuntime();
let harness: HausServerHarness;
let connection: HausConnection;
let owner: HausClient;
let runtime: McpRuntime;
let member: { subject: string; id: string };
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('crypto-owner'));
    serverId = (await owner.trpc.server.create.mutate({ displayName: 'Crypto', slug: 'crypto' }))
        .id;
    const [user] = (await harness.sql`
        select id from users where auth_subject = 'crypto-owner'
    `) as { id: string }[];
    member = { subject: 'crypto-owner', id: user?.id ?? '' };
    runtime = new McpRuntime(connection.db, serverEffectRuntime, {
        clientFactory: () => Promise.resolve(makeClient('coingecko').client),
    });
});

afterAll(async () => {
    await runtime?.close();
    await serverEffectRuntime.dispose();
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
