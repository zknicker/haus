import { expect, test } from 'bun:test';
import { readAmazonProductSummaries } from '../src/amazon-products/read-products.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import { makeServerRuntime } from '../src/server-runtime.ts';
import { findUserByClerkId } from '../src/users/haus-user.ts';
import { createHausClient } from './haus-client.ts';
import { startHausServerHarness } from './haus-server-harness.ts';

test('product cache shares lookups and rechecks connection state before serving cached data', async () => {
    const harness = await startHausServerHarness();
    const db = await connectHausDatabase(harness.databaseUrl);
    const effects = makeServerRuntime();
    const client = createHausClient(harness, await harness.clerk.mintSessionToken('product-cache'));
    let reads = 0;
    let enrichmentReady = true;
    const unknownAsin = 'B000000000';
    const upstream = makeClient('RankWrangler', {
        call: async (args) => {
            const request = args.arguments as Record<string, unknown>;
            if (request.operation === 'getMany') {
                expect(request.products).toContainEqual({
                    asin: expect.any(String),
                    marketplaceId: 'ATVPDKIKX0DER',
                });
                reads += 1;
                const known = (request.products as { asin: string }[]).some(
                    (product) => product.asin === 'B07XN9T11R'
                );
                return {
                    structuredContent: {
                        operation: 'getMany',
                        data: known
                            ? [
                                  {
                                      asin: 'B07XN9T11R',
                                      marketplaceId: 'ATVPDKIKX0DER',
                                      title: 'Freaky Lunch Lady Halloween Shirt',
                                      thumbnail: { status: 'unavailable' },
                                      amazonListingStatus: 'active',
                                  },
                              ]
                            : [],
                    },
                };
            }
            if (request.asin === unknownAsin) {
                return {
                    isError: true,
                    content: [
                        { type: 'text', text: '{"error":{"code":"NOT_FOUND","retryable":false}}' },
                    ],
                };
            }
            expect(request).toEqual({
                operation: 'get',
                asin: 'B07XN9T11R',
                marketplaceId: 'ATVPDKIKX0DER',
                include: ['shortName', 'cutoutThumbnail'],
            });
            if (!enrichmentReady) {
                return {
                    isError: true,
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: {
                                    code: 'TEMPORARILY_UNAVAILABLE',
                                    retryable: true,
                                    retryAfterSeconds: 2,
                                },
                            }),
                        },
                    ],
                };
            }
            return {
                structuredContent: {
                    operation: 'get',
                    data: {
                        asin: 'B07XN9T11R',
                        marketplaceId: 'ATVPDKIKX0DER',
                        listing: {
                            title: 'Freaky Lunch Lady Halloween Shirt',
                            shortName: 'Freaky Lunch Lady',
                            cutoutThumbnail: {
                                status: 'available',
                                url: 'https://images.example.com/cutout.webp',
                            },
                            thumbnail: { status: 'unavailable' },
                            amazonListingStatus: 'active',
                            bulletPoints: [],
                        },
                        price: null,
                    },
                },
            };
        },
    });
    const runtime = new McpRuntime(db.db, effects, { clientFactory: async () => upstream.client });
    try {
        const server = await client.trpc.server.create.mutate({
            displayName: 'Products',
            slug: 'product-cache',
        });
        const account = await client.trpc.mcp.addPresetAccount.mutate({
            serverId: server.id,
            preset: 'rankwrangler',
            name: 'RankWrangler',
        });
        const member = await findUserByClerkId(db.db, 'product-cache');
        const input = {
            serverId: server.id,
            products: [{ asin: 'B07XN9T11R', marketplaceId: 'ATVPDKIKX0DER' as const }],
        };
        expect(await readAmazonProductSummaries(db.db, runtime, member, input)).toBeNull();
        await harness.sql`update mcp_connections set connected = true, tools = ARRAY['rankwrangler_product'] where id = ${account.id}`;
        const results = await Promise.all([
            readAmazonProductSummaries(db.db, runtime, member, input),
            readAmazonProductSummaries(db.db, runtime, member, input),
        ]);
        expect(results[0]).toEqual(results[1]);
        expect(reads).toBe(1);
        expect(results[0]?.[0]).toMatchObject({
            status: 'found',
            product: {
                cutoutThumbnail: {
                    status: 'available',
                    url: 'https://images.example.com/cutout.webp',
                },
            },
        });
        await harness.sql`update mcp_connections set connected = false where id = ${account.id}`;
        expect(await readAmazonProductSummaries(db.db, runtime, member, input)).toBeNull();
        await runtime.closeConnection(account.id);
        await harness.sql`update mcp_connections set connected = true where id = ${account.id}`;
        enrichmentReady = false;
        const [pending] = (await readAmazonProductSummaries(db.db, runtime, member, input)) ?? [];
        expect(reads).toBe(2);
        expect(pending).toMatchObject({
            status: 'found',
            product: {
                title: 'Freaky Lunch Lady Halloween Shirt',
                shortName: null,
                cutoutThumbnail: null,
                enrichment: 'pending',
            },
        });
        await readAmazonProductSummaries(db.db, runtime, member, input);
        expect(reads).toBe(2);
        await Bun.sleep(2100);
        enrichmentReady = true;
        const [ready] = (await readAmazonProductSummaries(db.db, runtime, member, input)) ?? [];
        expect(reads).toBe(3);
        expect(ready).toMatchObject({
            status: 'found',
            product: { shortName: 'Freaky Lunch Lady', enrichment: 'ready' },
        });
        const unknown = { asin: unknownAsin, marketplaceId: 'ATVPDKIKX0DER' as const };
        const mixed = await readAmazonProductSummaries(db.db, runtime, member, {
            ...input,
            products: [...input.products, unknown],
        });
        expect(mixed?.map((result) => result.status)).toEqual(['found', 'unavailable']);
        expect(mixed?.[1]).toEqual({ ...unknown, status: 'unavailable' });
        await expect(readAmazonProductSummaries(db.db, runtime, null, input)).rejects.toThrow();
    } finally {
        await runtime.close();
        await effects.dispose();
        client.close();
        await db.close();
        await harness.close();
    }
});
