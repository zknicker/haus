import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('preset-owner'));
    outsider = createHausClient(harness, await harness.clerk.mintSessionToken('preset-outsider'));
    serverId = (await owner.trpc.server.create.mutate({ displayName: 'Presets', slug: 'presets' }))
        .id;
    await outsider.trpc.server.create.mutate({ displayName: 'Other', slug: 'other-presets' });
});

afterAll(async () => {
    owner?.close();
    outsider?.close();
    await harness?.close();
});

test('product previews require membership and a connected RankWrangler account', async () => {
    await expect(outsider.trpc.mcp.presetIcons.query({ serverId })).rejects.toThrow();
    const input = { serverId, asin: 'B07XN9T11R', marketplaceId: 'ATVPDKIKX0DER' as const };
    await expect(outsider.trpc.mcp.amazonProduct.query(input)).rejects.toThrow();
    await expect(owner.trpc.mcp.amazonProduct.query(input)).resolves.toBeNull();
    await expect(owner.trpc.mcp.amazonProductDetail.query(input)).resolves.toBeNull();
});

test('GitHub lands as an OAuth preset awaiting sign-in', async () => {
    const github = await owner.trpc.mcp.addPresetAccount.mutate({
        name: 'GitHub',
        preset: 'github',
        serverId,
    });
    expect(github).toMatchObject({
        auth: 'oauth',
        connected: false,
        preset: 'github',
        url: 'https://api.githubcopilot.com/mcp/',
    });
    await owner.trpc.mcp.delete.mutate({ connectionId: github.id, serverId });
});

test('Linear is a built-in connection, never an OAuth preset account', async () => {
    await expect(
        owner.trpc.mcp.addPresetAccount.mutate({
            name: 'Linear',
            preset: 'linear' as 'cloudflare',
            serverId,
        })
    ).rejects.toThrow();
});

test.each([
    ['cloudflare', 'https://mcp.cloudflare.com/mcp'],
    ['kittl', 'https://mcp.kittl.com/mcp'],
] as const)('%s awaits OAuth without credentials or Agent grants', async (preset, url) => {
    const created = await owner.trpc.mcp.addPresetAccount.mutate({
        name: preset,
        preset,
        serverId,
    });
    expect(created).toMatchObject({
        auth: 'oauth',
        connected: false,
        grants: [],
        headerNames: [],
        preset,
        tools: [],
        url,
    });
    const [stored] = await harness.sql`
        select secret from mcp_secrets where connection_id = ${created.id}
    `;
    expect(stored?.secret.oauthScopes).toEqual([]);
    expect(stored?.secret.headers).toEqual({});
    await owner.trpc.mcp.delete.mutate({ connectionId: created.id, serverId });
});

test.each([
    ['merchbase', 'https://core-api.merchbase.co/mcp'],
    ['rankwrangler', 'https://rankwrangler-api.merchbase.co/mcp'],
    ['merchbase-atlas', 'https://atlas-api.merchbase.co/mcp'],
    ['handmade', 'https://handmade-api.merchbase.co/mcp'],
    ['merchbase-fulfillment', 'https://fulfillment-api.merchbase.co/mcp/printful'],
    ['tmterminal', 'https://tmterminal-api.merchbase.co/mcp'],
] as const)('%s awaits discovered OAuth without identity scopes or Agent grants', async (preset, url) => {
    const fulfillment = await owner.trpc.mcp.addPresetAccount.mutate({
        name: preset,
        preset,
        serverId,
    });
    expect(fulfillment).toMatchObject({
        auth: 'oauth',
        connected: false,
        grants: [],
        headerNames: [],
        preset,
        tools: [],
        url,
    });
    const [stored] = await harness.sql`
        select secret from mcp_secrets where connection_id = ${fulfillment.id}
    `;
    expect(stored?.secret.oauthScopes).toEqual([]);
    expect(stored?.secret.headers).toEqual({});
    await owner.trpc.mcp.delete.mutate({ connectionId: fulfillment.id, serverId });
});

test.each([
    'github',
    'merchbase',
    'merchbase-atlas',
    'handmade',
    'merchbase-fulfillment',
    'tmterminal',
    'google-calendar',
    'rankwrangler',
    'cloudflare',
    'kittl',
] as const)('deletes a %s account and its secrets without removing another account', async (preset) => {
    const first = await owner.trpc.mcp.addPresetAccount.mutate({ name: preset, preset, serverId });
    const second = await owner.trpc.mcp.addPresetAccount.mutate({ name: preset, preset, serverId });
    expect(first.id).not.toBe(second.id);
    const input = { connectionId: first.id, serverId };

    await expect(outsider.trpc.mcp.delete.mutate(input)).rejects.toThrow();
    expect(await owner.trpc.mcp.list.query({ serverId })).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: first.id })])
    );

    await expect(owner.trpc.mcp.delete.mutate(input)).resolves.toMatchObject({ id: first.id });
    expect(
        await harness.sql`select * from mcp_secrets where connection_id = ${first.id}`
    ).toHaveLength(0);
    expect(await owner.trpc.mcp.list.query({ serverId })).toEqual([
        expect.objectContaining({ id: second.id }),
    ]);

    await harness.sql`update mcp_connections set connected = true where id = ${second.id}`;
    await expect(
        owner.trpc.mcp.delete.mutate({ connectionId: second.id, serverId })
    ).resolves.toMatchObject({ connected: true, id: second.id });
    expect(await owner.trpc.mcp.list.query({ serverId })).toEqual([]);
    expect(
        await harness.sql`select * from mcp_secrets where connection_id = ${second.id}`
    ).toHaveLength(0);
});
