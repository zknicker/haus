import type { AmazonProductDetail, AmazonProductIdentity } from '@haus/api';
import {
    assertSameProduct,
    parseProductDetails,
    parseProductSummaries,
    RankWranglerError,
} from './rankwrangler-payload.ts';

export type RankWranglerRead = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Chip summaries: one `getMany` for the basics plus a best-effort enriched `get`
 * per product. Enrichment never fails a summary; any enrichment error yields
 * null short name and cutout, marked `pending` when RankWrangler says retry.
 */
export function lookupProductSummaries(
    read: RankWranglerRead,
    products: AmazonProductIdentity[]
): Map<string, Promise<AmazonProductDetail>> {
    const basics = read({ operation: 'getMany', products }).then(parseProductSummaries);
    return new Map(
        products.map((product) => {
            const enriched = readEnrichment(read, product);
            const summary = Promise.all([basics, enriched]).then(([list, enrichment]) => {
                const basic = list.find((item) => item.asin === product.asin);
                if (!basic) {
                    throw new Error('RankWrangler omitted a requested product.');
                }
                assertSameProduct(basic, product);
                if (enrichment === 'pending' || enrichment === 'unavailable') {
                    return {
                        ...basic,
                        price: null,
                        enrichment: enrichment === 'pending' ? 'pending' : 'ready',
                    } satisfies AmazonProductDetail;
                }
                return {
                    ...basic,
                    brand: enrichment.brand,
                    shortName: enrichment.shortName,
                    cutoutThumbnail: enrichment.cutoutThumbnail,
                    price: null,
                    enrichment: 'ready',
                } satisfies AmazonProductDetail;
            });
            return [product.asin, summary] as const;
        })
    );
}

export async function lookupProductDetail(
    read: RankWranglerRead,
    product: AmazonProductIdentity
): Promise<AmazonProductDetail> {
    const detail = parseProductDetails(
        await read({ operation: 'get', ...product, include: ['marketData'] })
    );
    assertSameProduct(detail, product);
    return detail;
}

async function readEnrichment(
    read: RankWranglerRead,
    product: AmazonProductIdentity
): Promise<AmazonProductDetail | 'pending' | 'unavailable'> {
    try {
        const detail = parseProductDetails(
            await read({ operation: 'get', ...product, include: ['shortName', 'cutoutThumbnail'] })
        );
        assertSameProduct(detail, product);
        return detail;
    } catch (error) {
        // Retryable is the expected cold state and is polled; stay quiet for it.
        if (error instanceof RankWranglerError && error.retryable) {
            return 'pending';
        }
        console.warn('[haus] Amazon product enrichment failed; serving basics only', {
            asin: product.asin,
            code: error instanceof RankWranglerError ? error.code : undefined,
            error: error instanceof Error ? error.message : String(error),
        });
        return 'unavailable';
    }
}
