import { afterEach, expect, spyOn, test } from 'bun:test';
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
const upstreamError = (code: string, retryable: boolean) => ({
    isError: true,
    content: [
        {
            type: 'text',
            text: JSON.stringify({ error: { code, retryable, retryAfterSeconds: 2 } }),
        },
    ],
});

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
    expect(summary).toMatchObject({
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
    expect(summary).toMatchObject({ shortName: null, cutoutThumbnail: null, enrichment: 'ready' });
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
    expect(summary).toMatchObject({
        title: 'Flamingoween Halloween Flamingo Shirt',
        enrichment: 'ready',
    });
    expect(warn).toHaveBeenCalledTimes(1);
});

test('ready enrichment fills short name, cutout, and brand', async () => {
    const { read } = readWith({
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
    });
    const summary = await lookupProductSummaries(read, [identity]).get(identity.asin);
    expect(summary).toMatchObject({
        shortName: 'Flamingoween',
        brand: 'Halloween by 14th Floor',
        cutoutThumbnail: { status: 'available', url: 'https://images.example.com/cutout.webp' },
        thumbnail: { status: 'available', url: 'https://images.example.com/product.jpg' },
        enrichment: 'ready',
    });
});

test('a failed basic lookup fails the summary', async () => {
    const read: RankWranglerRead = async () => upstreamError('INTERNAL', false);
    await expect(lookupProductSummaries(read, [identity]).get(identity.asin)).rejects.toThrow(
        'INTERNAL'
    );
});
