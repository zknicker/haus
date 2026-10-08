import { expect, test } from 'bun:test';
import { type AmazonProductQueryState, amazonProductLookupState } from './amazon-product-lookup.ts';

const identity = { asin: 'B07XN9T11R', marketplaceId: 'ATVPDKIKX0DER' } as const;
const fresh: AmazonProductQueryState = { data: undefined, failureCount: 0, errorUpdateCount: 0 };
const status = (state: Partial<AmazonProductQueryState>) =>
    amazonProductLookupState({ ...fresh, ...state }).status;

test('a lookup moves loading, retrying, then temporarily unavailable', () => {
    expect(status({})).toBe('loading');
    expect(status({ failureCount: 2 })).toBe('retrying');
    expect(status({ failureCount: 4, errorUpdateCount: 1 })).toBe('temporarilyUnavailable');
});

test('a refetch after giving up keeps the explanation instead of bare loading', () => {
    // React Query resets status to pending and failureCount to 0 when it refetches without data.
    expect(status({ errorUpdateCount: 1 })).toBe('temporarilyUnavailable');
    expect(status({ errorUpdateCount: 1, failureCount: 1 })).toBe('temporarilyUnavailable');
});

test('settled data wins over earlier failures', () => {
    expect(status({ data: { ...identity, status: 'unavailable' }, errorUpdateCount: 2 })).toBe(
        'unavailable'
    );
    expect(
        status({
            errorUpdateCount: 2,
            data: {
                status: 'found',
                product: {
                    ...identity,
                    title: 'Freaky Lunch Lady Shirt',
                    brand: null,
                    shortName: null,
                    thumbnail: { status: 'unavailable' },
                    cutoutThumbnail: null,
                    amazonListingStatus: 'active',
                },
            },
        })
    ).toBe('found');
});
