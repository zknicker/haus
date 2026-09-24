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
    const input = {
        serverId,
        products: [{ asin: 'B07XN9T11R', marketplaceId: 'ATVPDKIKX0DER' as const }],
    };
    await expect(outsider.trpc.mcp.amazonProducts.query(input)).rejects.toThrow();
    await expect(owner.trpc.mcp.amazonProducts.query(input)).resolves.toBeNull();
    await expect(
        owner.trpc.mcp.amazonProductDetail.query({ serverId, ...input.products[0] })
    ).resolves.toBeNull();
});

test.each([
    'merchbase',
    'google-calendar',
    'rankwrangler',
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
