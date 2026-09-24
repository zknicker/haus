import { expect, test } from 'bun:test';
import type { AmazonProductSummary } from '@haus/api';
import { parseProductDetails, rankWranglerPayload } from './read-products.ts';

const product = {
    asin: 'B07XN9T11R',
    marketplaceId: 'ATVPDKIKX0DER',
    shortName: 'Freaky Lunch Lady',
    cutoutThumbnail: { status: 'available', url: 'https://images.example.com/cutout.webp' },
    title: 'Freaky Lunch Lady',
    brand: 'Lunch Lady Designs',
    thumbnail: { status: 'available', url: 'https://images.example.com/product.jpg' },
    amazonListingStatus: 'active',
} satisfies AmazonProductSummary;
test('reads RankWrangler structured and text MCP envelopes', () => {
    const payload = {
        operation: 'get',
        data: {
            asin: product.asin,
            marketplaceId: product.marketplaceId,
            listing: { ...product, bulletPoints: [] },
            price: null,
        },
    };
    const expected = { ...product, price: null };
    expect(parseProductDetails({ structuredContent: payload })).toEqual(expected);
    expect(
        parseProductDetails({ content: [{ type: 'text', text: JSON.stringify(payload) }] })
    ).toEqual(expected);
});
test('maps title, brand and price without exposing feature bullets', () => {
    expect(
        parseProductDetails({
            structuredContent: {
                operation: 'get',
                data: {
                    asin: product.asin,
                    marketplaceId: product.marketplaceId,
                    listing: { ...product, bulletPoints: ['First', 'Second', 'Third'] },
                    price: { amountMinor: 1999, currencyCode: 'USD' },
                },
            },
        })
    ).toEqual({
        ...product,
        price: { amountMinor: 1999, currencyCode: 'USD' },
    });
});
test('rejects upstream errors and invalid thumbnail URLs without inventing product data', () => {
    expect(() => rankWranglerPayload({ isError: true, structuredContent: product })).toThrow();
    expect(() =>
        parseProductDetails({
            structuredContent: {
                operation: 'get',
                data: {
                    asin: product.asin,
                    marketplaceId: product.marketplaceId,
                    price: null,
                    listing: {
                        ...product,
                        bulletPoints: [],
                        thumbnail: { status: 'available', url: 'javascript:alert(1)' },
                    },
                },
            },
        })
    ).toThrow();
});
