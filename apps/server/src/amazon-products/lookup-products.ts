import {
    type AmazonProductDetail,
    type AmazonProductIdentity,
    type AmazonProductResult,
    amazonProductMaxRetryAfterSeconds,
} from '@haus/api';
import { McpUpstreamError } from '../server-mcp/errors.ts';
import {
    assertSameProduct,
    parseProductDetails,
    parseProductSummaries,
    RankWranglerError,
    summaryFields,
} from './rankwrangler-payload.ts';

export type RankWranglerRead = (args: Record<string, unknown>) => Promise<unknown>;

const defaultRetryAfterSeconds = 2;

/**
 * Chip summaries from one RankWrangler `getMany` per batch. A batch failure
 * applies to every product in it: transient → `temporarilyUnavailable`, else
 * `unavailable`. A product the response omits is `unavailable`. Never rejects.
 */
export function lookupProductSummaries(
    read: RankWranglerRead,
    products: AmazonProductIdentity[]
): Map<string, Promise<AmazonProductResult>> {
    const resolve = read({ operation: 'getMany', products, include: [...summaryFields] })
        .then(parseProductSummaries)
        .then(
            (list) =>
                (product: AmazonProductIdentity): AmazonProductResult => {
                    const found = list.find(
                        (item) =>
                            item.asin === product.asin &&
                            item.marketplaceId === product.marketplaceId
                    );
                    return found
                        ? { status: 'found', product: found }
                        : { ...product, status: 'unavailable' };
                },
            (error: unknown) => {
                const retryAfter = transientRetryAfter(error);
                // Retryable is polled by the App; stay quiet for it.
                if (retryAfter === null) {
                    warn('Amazon product summaries failed', error);
                }
                return (product: AmazonProductIdentity): AmazonProductResult =>
                    retryAfter === null
                        ? { ...product, status: 'unavailable' }
                        : {
                              ...product,
                              status: 'temporarilyUnavailable',
                              retryAfterSeconds: retryAfter,
                          };
            }
        );
    return new Map(products.map((product) => [product.asin, resolve.then((of) => of(product))]));
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

/** Seconds to wait before retrying a transient failure; null when retrying cannot help. */
function transientRetryAfter(error: unknown): number | null {
    let seconds: number | null = null;
    if (error instanceof RankWranglerError) {
        if (!error.retryable) {
            return null;
        }
        seconds = error.retryAfterSeconds;
    } else if (!(error instanceof McpUpstreamError) || error.code === 'MCP_AUTH_REQUIRED') {
        return null;
    }
    const wait = Math.ceil(seconds ?? defaultRetryAfterSeconds);
    return Math.min(Math.max(wait, 1), amazonProductMaxRetryAfterSeconds);
}

function warn(message: string, error: unknown) {
    console.warn(`[haus] ${message}`, {
        code:
            error instanceof RankWranglerError || error instanceof McpUpstreamError
                ? error.code
                : undefined,
        error: error instanceof Error ? error.message : String(error),
    });
}
