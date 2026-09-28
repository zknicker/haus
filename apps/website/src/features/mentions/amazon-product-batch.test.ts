import { expect, test } from 'bun:test';
import type { AmazonProductSummary } from '@haus/api';
import { createAmazonProductBatcher, type ReadAmazonProducts } from './amazon-product-batch.ts';

const summaryFor = (asin: string): AmazonProductSummary => ({
    asin,
    marketplaceId: 'ATVPDKIKX0DER',
    title: asin,
    brand: null,
    shortName: null,
    thumbnail: { status: 'unavailable' },
    cutoutThumbnail: null,
    amazonListingStatus: 'active',
    enrichment: 'ready',
});
const product = (asin: string) => ({ asin, marketplaceId: 'ATVPDKIKX0DER' }) as const;

test('chips mounted together share one Server read', async () => {
    const reads: Parameters<ReadAmazonProducts>[0][] = [];
    const load = createAmazonProductBatcher(async (input) => {
        reads.push(input);
        return input.products.map((item) => summaryFor(item.asin));
    });
    const results = await Promise.all([
        load('server', product('B07XN9T11R')),
        load('server', product('B0DDZPDF14')),
        load('server', product('B07XN9T11R')),
    ]);
    expect(results.map((result) => result?.asin)).toEqual([
        'B07XN9T11R',
        'B0DDZPDF14',
        'B07XN9T11R',
    ]);
    expect(reads).toEqual([
        { serverId: 'server', products: [product('B07XN9T11R'), product('B0DDZPDF14')] },
    ]);
});

test('a disconnected Server resolves null; an omitted product rejects', async () => {
    expect(
        await createAmazonProductBatcher(async () => null)('server', product('B07XN9T11R'))
    ).toBe(null);
    await expect(
        createAmazonProductBatcher(async () => [])('server', product('B07XN9T11R'))
    ).rejects.toThrow('omitted');
});
