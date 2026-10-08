import { afterEach, expect, spyOn, test } from 'bun:test';
import type { AmazonProductResult } from '@haus/api';
import { McpUpstreamError } from '../server-mcp/errors.ts';
import { lookupProductSummaries, type RankWranglerRead } from './lookup-products.ts';

const identity = { asin: 'B07X1MGDCN', marketplaceId: 'ATVPDKIKX0DER' } as const;
const other = { asin: 'B0DDZPDF14', marketplaceId: 'ATVPDKIKX0DER' } as const;
const basics = {
    title: 'Flamingoween Halloween Flamingo Shirt',
    thumbnail: { status: 'available', url: 'https://images.example.com/product.jpg' },
    amazonListingStatus: 'active',
} as const;
const ready = {
    ...identity,
    ...basics,
    shortName: 'Flamingoween',
    cutoutThumbnail: { status: 'available', url: 'https://images.example.com/cutout.webp' },
    pending: [],
};
const pending = {
    ...identity,
    ...basics,
    shortName: null,
    cutoutThumbnail: { status: 'pending' },
    pending: ['shortName', 'cutoutThumbnail'],
};
const settledNone = {
    ...identity,
    ...basics,
    shortName: null,
    cutoutThumbnail: { status: 'unavailable' },
    pending: [],
};
const getMany = (...data: unknown[]) => ({ structuredContent: { operation: 'getMany', data } });
const upstreamError = (code: string, retryable: boolean, retryAfterSeconds = 2) => ({
    isError: true,
    content: [
        { type: 'text', text: JSON.stringify({ error: { code, retryable, retryAfterSeconds } }) },
    ],
});

const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
afterEach(() => warn.mockClear());

function readReturning(response: unknown) {
    const calls: Record<string, unknown>[] = [];
    const read: RankWranglerRead = async (args) => {
        calls.push(args);
        return response;
    };
    return { calls, read };
}

async function lookup(response: unknown, products = [identity, other]) {
    const { calls, read } = readReturning(response);
    const results = lookupProductSummaries(read, products);
    const settled = await Promise.all(products.map((product) => results.get(product.asin)));
    return { calls, settled };
}

test('makes exactly one getMany with include for the whole batch', async () => {
    const { calls } = await lookup(getMany(ready, { ...ready, ...other }));
    expect(calls).toEqual([
        {
            operation: 'getMany',
            products: [identity, other],
            include: ['shortName', 'cutoutThumbnail'],
        },
    ]);
});

test('a ready item returns its short name and cutout, marked ready', async () => {
    const { settled } = await lookup(getMany(ready), [identity]);
    expect(settled[0]).toEqual({
        status: 'found',
        product: {
            ...identity,
            ...basics,
            brand: null,
            shortName: 'Flamingoween',
            cutoutThumbnail: { status: 'available', url: 'https://images.example.com/cutout.webp' },
            enrichment: 'ready',
        },
    });
});

test('a pending item returns its basics, marked pending', async () => {
    const { settled } = await lookup(getMany(pending), [identity]);
    expect(found(settled[0])).toMatchObject({
        ...basics,
        shortName: null,
        cutoutThumbnail: null,
        enrichment: 'pending',
    });
});

test('a settled item without enrichment is ready with an unavailable cutout', async () => {
    const { settled } = await lookup(getMany(settledNone), [identity]);
    expect(found(settled[0])).toMatchObject({
        shortName: null,
        cutoutThumbnail: { status: 'unavailable' },
        enrichment: 'ready',
    });
});

test('rejects a pending list naming fields Haus did not request', async () => {
    const { settled } = await lookup(getMany({ ...pending, pending: ['marketData'] }), [identity]);
    expect(settled[0]).toEqual({ ...identity, status: 'unavailable' });
    expect(warn).toHaveBeenCalledTimes(1);
});

test('a product getMany omits is unavailable without failing its siblings', async () => {
    const { settled } = await lookup(getMany(ready));
    expect(settled[0]).toMatchObject({ status: 'found' });
    expect(settled[1]).toEqual({ ...other, status: 'unavailable' });
});

test('a retryable batch error makes every product temporarily unavailable', async () => {
    const { calls, settled } = await lookup(upstreamError('TEMPORARILY_UNAVAILABLE', true, 5));
    expect(settled).toEqual([
        { ...identity, status: 'temporarilyUnavailable', retryAfterSeconds: 5 },
        { ...other, status: 'temporarilyUnavailable', retryAfterSeconds: 5 },
    ]);
    expect(calls).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
});

test('retry waits are clamped to the contract bounds', async () => {
    const { settled } = await lookup(upstreamError('TEMPORARILY_UNAVAILABLE', true, 600));
    expect(settled[0]).toMatchObject({ retryAfterSeconds: 30 });
});

test('an MCP timeout is transient with the default wait', async () => {
    const read: RankWranglerRead = () =>
        Promise.reject(new McpUpstreamError('MCP_TIMEOUT', 'The MCP invocation timed out.'));
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(summary).toEqual({
        ...identity,
        status: 'temporarilyUnavailable',
        retryAfterSeconds: 2,
    });
});

test('a non-retryable batch error makes every product unavailable', async () => {
    const { settled } = await lookup(upstreamError('INTERNAL', false));
    expect(settled).toEqual([
        { ...identity, status: 'unavailable' },
        { ...other, status: 'unavailable' },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
});

function found(result: AmazonProductResult | undefined) {
    if (result?.status !== 'found') {
        throw new Error(`Expected a found product, got ${result?.status}`);
    }
    return result.product;
}
