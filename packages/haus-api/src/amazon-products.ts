import { z } from 'zod';

export const rankWranglerMcpUrl = 'https://rankwrangler.merchbase.co/mcp';
export const amazonProductIdentitySchema = z.object({
    asin: z.string().regex(/^B(?=[A-Z0-9]*\d)[A-Z0-9]{9}$/u),
    marketplaceId: z.literal('ATVPDKIKX0DER'),
});
export type AmazonProductIdentity = z.infer<typeof amazonProductIdentitySchema>;

const amazonThumbnailSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('available'), url: z.url().startsWith('https://') }),
    z.object({ status: z.literal('unavailable') }),
]);

export const amazonProductSummarySchema = amazonProductIdentitySchema.extend({
    title: z.string().nullable(),
    brand: z.string().nullable().default(null),
    shortName: z.string().trim().min(1).nullable().default(null),
    thumbnail: amazonThumbnailSchema,
    cutoutThumbnail: amazonThumbnailSchema.nullable().default(null),
    amazonListingStatus: z.enum(['active', 'deleted']),
});
export const amazonProductDetailSchema = amazonProductSummarySchema.extend({
    price: z
        .object({ amountMinor: z.number().int().nonnegative(), currencyCode: z.literal('USD') })
        .nullable(),
});
export type AmazonProductSummary = z.infer<typeof amazonProductSummarySchema>;
export type AmazonProductDetail = z.infer<typeof amazonProductDetailSchema>;

export function parseAmazonProduct(value: string): AmazonProductIdentity | null {
    let asin = value;
    if (!/^B[A-Z0-9]{9}$/u.test(value)) {
        try {
            const url = new URL(value);
            if (
                !(
                    ['https:', 'http:'].includes(url.protocol) &&
                    ['amazon.com', 'www.amazon.com', 'smile.amazon.com', 'm.amazon.com'].includes(
                        url.hostname
                    )
                ) ||
                url.username ||
                url.password ||
                url.port
            ) {
                return null;
            }
            asin =
                url.pathname.match(
                    /\/(?:dp|gp\/product|gp\/aw\/d)\/(B[A-Z0-9]{9})(?:\/|$)/u
                )?.[1] ?? '';
        } catch {
            return null;
        }
    }
    const parsed = amazonProductIdentitySchema.safeParse({ asin, marketplaceId: 'ATVPDKIKX0DER' });
    return parsed.success ? parsed.data : null;
}

export function amazonProductUrl(product: AmazonProductIdentity): string {
    return `https://www.amazon.com/dp/${product.asin}`;
}
