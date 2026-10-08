import { afterEach, expect, spyOn, test } from 'bun:test';
import { McpUpstreamError } from '../server-mcp/errors.ts';
import { lookupProductSummary, type RankWranglerRead } from './lookup-products.ts';

const identity = { asin: 'B07X1MGDCN', marketplaceId: 'ATVPDKIKX0DER' } as const;
const listing = {
    title: 'Flamingoween Halloween Flamingo Shirt',
    brand: 'Flamingo Designs',
    thumbnail: { status: 'available', url: 'https://images.example.com/product.jpg' },
    amazonListingStatus: 'active',
} as const;
const get = (enrichment: object, asin: string = identity.asin) => ({
    structuredContent: {
        operation: 'get',
        data: {
            asin,
            marketplaceId: identity.marketplaceId,
            listing: { ...listing, ...enrichment, bulletPoints: [] },
            price: null,
        },
    },
});
const enriched = {
    shortName: 'Flamingoween',
    cutoutThumbnail: { status: 'available', url: 'https://images.example.com/cutout.webp' },
} as const;
const upstreamError = (code: string, retryable: boolean, retryAfterSeconds = 2) => ({
    isError: true,
    content: [
        { type: 'text', text: JSON.stringify({ error: { code, retryable, retryAfterSeconds } }) },
    ],
});

const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
afterEach(() => warn.mockClear());

async function lookup(response: unknown) {
    const calls: Record<string, unknown>[] = [];
    const read: RankWranglerRead = async (args) => {
        calls.push(args);
        return response;
    };
    return { calls, result: await lookupProductSummary(read, identity) };
}

test('makes exactly one get with the summary fields', async () => {
    const { calls } = await lookup(get(enriched));
    expect(calls).toEqual([
        { operation: 'get', ...identity, include: ['shortName', 'cutoutThumbnail'] },
    ]);
});

test('an enriched listing returns its short name, cutout, and brand', async () => {
    const { result } = await lookup(get(enriched));
    expect(result).toEqual({ status: 'found', product: { ...identity, ...listing, ...enriched } });
});

test('enrichment RankWrangler could not finish settles as absent', async () => {
    const { result } = await lookup(
        get({ shortName: null, cutoutThumbnail: { status: 'unavailable' } })
    );
    expect(result).toMatchObject({
        status: 'found',
        product: { shortName: null, cutoutThumbnail: { status: 'unavailable' } },
    });
});

test('a response for a different product is unavailable', async () => {
    const { result } = await lookup(get(enriched, 'B0DDZPDF14'));
    expect(result).toEqual({ ...identity, status: 'unavailable' });
    expect(warn).toHaveBeenCalledTimes(1);
});

test('a retryable error is temporarily unavailable without a warning', async () => {
    const { calls, result } = await lookup(upstreamError('TEMPORARILY_UNAVAILABLE', true, 5));
    expect(result).toEqual({ ...identity, status: 'temporarilyUnavailable', retryAfterSeconds: 5 });
    expect(calls).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
});

test('retry waits are clamped to the contract bounds', async () => {
    const { result } = await lookup(upstreamError('TEMPORARILY_UNAVAILABLE', true, 600));
    expect(result).toMatchObject({ retryAfterSeconds: 30 });
});

test('an MCP timeout is transient with the default wait', async () => {
    const read: RankWranglerRead = () =>
        Promise.reject(new McpUpstreamError('MCP_TIMEOUT', 'The MCP invocation timed out.'));
    expect(await lookupProductSummary(read, identity)).toEqual({
        ...identity,
        status: 'temporarilyUnavailable',
        retryAfterSeconds: 2,
    });
});

test('a non-retryable error, such as an unknown ASIN, is unavailable', async () => {
    const { result } = await lookup(upstreamError('NOT_FOUND', false));
    expect(result).toEqual({ ...identity, status: 'unavailable' });
    expect(warn).toHaveBeenCalledTimes(1);
});
