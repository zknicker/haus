import { afterEach, expect, spyOn, test } from 'bun:test';
import type { AmazonProductResult } from '@haus/api';
import { McpUpstreamError } from '../server-mcp/errors.ts';
import { lookupProductSummaries, type RankWranglerRead } from './lookup-products.ts';

const identity = { asin: 'B07X1MGDCN', marketplaceId: 'ATVPDKIKX0DER' } as const;
const basics = {
    structuredContent: {
        operation: 'getMany',
        data: [
            {
                ...identity,
                title: 'Flamingoween Halloween Flamingo Shirt',
                thumbnail: { status: 'available', url: 'https://images.example.com/product.jpg' },
                amazonListingStatus: 'active',
            },
        ],
    },
};
const upstreamError = (code: string, retryable: boolean, retryAfterSeconds = 2) => ({
    isError: true,
    content: [
        {
            type: 'text',
            text: JSON.stringify({ error: { code, retryable, retryAfterSeconds } }),
        },
    ],
});
const enrichedDetail = {
    structuredContent: {
        operation: 'get',
        data: {
            ...identity,
            price: null,
            listing: {
                title: 'Flamingoween Halloween Flamingo Shirt',
                brand: 'Halloween by 14th Floor',
                shortName: 'Flamingoween',
                cutoutThumbnail: {
                    status: 'available',
                    url: 'https://images.example.com/cutout.webp',
                },
                thumbnail: { status: 'unavailable' },
                amazonListingStatus: 'active',
            },
        },
    },
};

const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
afterEach(() => warn.mockClear());

function readWith(enriched: unknown) {
    const calls: Record<string, unknown>[] = [];
    const read: RankWranglerRead = async (args) => {
        calls.push(args);
        return args.operation === 'getMany' ? basics : enriched;
    };
    return { calls, read };
}

test('unfinished enrichment still returns title and thumbnail, marked pending', async () => {
    const { calls, read } = readWith(upstreamError('TEMPORARILY_UNAVAILABLE', true));
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(summary).toMatchObject({ status: 'found' });
    expect(found(summary)).toMatchObject({
        ...identity,
        title: 'Flamingoween Halloween Flamingo Shirt',
        thumbnail: { status: 'available', url: 'https://images.example.com/product.jpg' },
        shortName: null,
        cutoutThumbnail: null,
        enrichment: 'pending',
    });
    expect(warn).not.toHaveBeenCalled();
    expect(calls).toEqual([
        { operation: 'getMany', products: [identity] },
        { operation: 'get', ...identity, include: ['shortName', 'cutoutThumbnail'] },
    ]);
});

test('a non-retryable enrichment error settles as ready without enrichment', async () => {
    const { read } = readWith(upstreamError('NOT_FOUND', false));
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(found(summary)).toMatchObject({
        shortName: null,
        cutoutThumbnail: null,
        enrichment: 'ready',
    });
    expect(warn).toHaveBeenCalledTimes(1);
});

test('a transport failure in enrichment still serves the basics', async () => {
    const read: RankWranglerRead = async (args) => {
        if (args.operation === 'getMany') {
            return basics;
        }
        throw new Error('socket hang up');
    };
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(found(summary)).toMatchObject({
        title: 'Flamingoween Halloween Flamingo Shirt',
        enrichment: 'ready',
    });
    expect(warn).toHaveBeenCalledTimes(1);
});

test('ready enrichment fills short name, cutout, and brand', async () => {
    const { read } = readWith(enrichedDetail);
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(found(summary)).toMatchObject({
        shortName: 'Flamingoween',
        brand: 'Halloween by 14th Floor',
        cutoutThumbnail: { status: 'available', url: 'https://images.example.com/cutout.webp' },
        thumbnail: { status: 'available', url: 'https://images.example.com/product.jpg' },
        enrichment: 'ready',
    });
});

test('a retryable getMany failure falls back to the per-product read', async () => {
    const read: RankWranglerRead = async (args) =>
        args.operation === 'getMany'
            ? upstreamError('TEMPORARILY_UNAVAILABLE', true)
            : enrichedDetail;
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(summary).toEqual({
        status: 'found',
        product: {
            ...identity,
            title: 'Flamingoween Halloween Flamingo Shirt',
            brand: 'Halloween by 14th Floor',
            shortName: 'Flamingoween',
            cutoutThumbnail: { status: 'available', url: 'https://images.example.com/cutout.webp' },
            thumbnail: { status: 'unavailable' },
            amazonListingStatus: 'active',
            enrichment: 'ready',
        },
    });
    expect(warn).not.toHaveBeenCalled();
});

test('an MCP timeout on getMany also falls back to the per-product read', async () => {
    const read: RankWranglerRead = async (args) => {
        if (args.operation === 'getMany') {
            throw new McpUpstreamError('MCP_TIMEOUT', 'The MCP invocation timed out.');
        }
        return enrichedDetail;
    };
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(found(summary)).toMatchObject({ shortName: 'Flamingoween' });
});

test('when both reads are retryable the product is temporarily unavailable', async () => {
    const read: RankWranglerRead = async (args) =>
        upstreamError('TEMPORARILY_UNAVAILABLE', true, args.operation === 'getMany' ? 2 : 5);
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(summary).toEqual({
        ...identity,
        status: 'temporarilyUnavailable',
        retryAfterSeconds: 5,
    });
    expect(warn).not.toHaveBeenCalled();
});

test('retry waits are clamped to the contract bounds', async () => {
    const read: RankWranglerRead = async () => upstreamError('TEMPORARILY_UNAVAILABLE', true, 600);
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(summary).toMatchObject({ retryAfterSeconds: 30 });
});

test('permanent failures of both reads make the product unavailable', async () => {
    const read: RankWranglerRead = async () => upstreamError('INTERNAL', false);
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(summary).toEqual({ ...identity, status: 'unavailable' });
});

test('a product getMany omits is unavailable without failing its batch siblings', async () => {
    const other = { asin: 'B0DDZPDF14', marketplaceId: 'ATVPDKIKX0DER' } as const;
    const { read } = readWith(upstreamError('NOT_FOUND', false));
    const results = lookupProductSummaries(read, [identity, other]);
    expect(await results.get(identity.asin)).toMatchObject({ status: 'found' });
    expect(await results.get(other.asin)).toEqual({ ...other, status: 'unavailable' });
});

test('a product getMany omits still resolves from its per-product read', async () => {
    const read: RankWranglerRead = async (args) =>
        args.operation === 'getMany'
            ? { structuredContent: { operation: 'getMany', data: [] } }
            : enrichedDetail;
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(found(summary)).toMatchObject({ shortName: 'Flamingoween' });
});

function found(result: AmazonProductResult | undefined) {
    if (result?.status !== 'found') {
        throw new Error(`Expected a found product, got ${result?.status}`);
    }
    return result.product;
}
