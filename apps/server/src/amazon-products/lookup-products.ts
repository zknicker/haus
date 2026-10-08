import {
    type AmazonProductDetail,
    type AmazonProductIdentity,
    type AmazonProductResult,
    type AmazonProductSummary,
    amazonProductMaxRetryAfterSeconds,
    amazonProductSummarySchema,
} from '@haus/api';
import { McpUpstreamError } from '../server-mcp/errors.ts';
import {
    assertSameProduct,
    parseProductDetails,
    parseProductSummaries,
    RankWranglerError,
} from './rankwrangler-payload.ts';

export type RankWranglerRead = (args: Record<string, unknown>) => Promise<unknown>;

type Basics = { ok: true; list: AmazonProductSummary[] } | { ok: false; retryAfter: number | null };
/** A failed read carries the seconds to wait when the failure is transient, else null. */
type Enrichment =
    | { ok: true; detail: AmazonProductDetail }
    | { ok: false; retryAfter: number | null };

const defaultRetryAfterSeconds = 2;

/**
 * Chip summaries: one `getMany` for the basics plus a best-effort enriched `get`
 * per product. The `get` also carries the basics, so a failed `getMany` falls
 * back to it. A product is `temporarilyUnavailable` only when neither read
 * produced its data and at least one failure is transient. Never rejects.
 */
export function lookupProductSummaries(
    read: RankWranglerRead,
    products: AmazonProductIdentity[]
): Map<string, Promise<AmazonProductResult>> {
    const basics = read({ operation: 'getMany', products })
        .then(parseProductSummaries)
        .then(
            (list): Basics => ({ ok: true, list }),
            (error: unknown): Basics => {
                const retryAfter = transientRetryAfter(error);
                if (retryAfter === null) {
                    warn('Amazon product basics failed; using per-product reads', error);
                }
                return { ok: false, retryAfter };
            }
        );
    return new Map(
        products.map((product) => {
            const result = Promise.all([basics, readEnrichment(read, product)]).then(
                ([basic, enrichment]) => summarize(product, basic, enrichment),
                (error: unknown): AmazonProductResult => {
                    warn('Amazon product summary failed', error, product);
                    return { ...product, status: 'unavailable' };
                }
            );
            return [product.asin, result] as const;
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

function summarize(
    product: AmazonProductIdentity,
    basics: Basics,
    enrichment: Enrichment
): AmazonProductResult {
    const basic = basics.ok
        ? basics.list.find(
              (item) => item.asin === product.asin && item.marketplaceId === product.marketplaceId
          )
        : undefined;
    if (basic) {
        if (!enrichment.ok) {
            const enrichmentState = enrichment.retryAfter === null ? 'ready' : 'pending';
            return { status: 'found', product: { ...basic, enrichment: enrichmentState } };
        }
        const { brand, shortName, cutoutThumbnail } = enrichment.detail;
        return {
            status: 'found',
            product: { ...basic, brand, shortName, cutoutThumbnail, enrichment: 'ready' },
        };
    }
    if (enrichment.ok) {
        return { status: 'found', product: amazonProductSummarySchema.parse(enrichment.detail) };
    }
    if (basics.ok) {
        // `getMany` answered without this product and `get` failed too.
        return { ...product, status: 'unavailable' };
    }
    const waits = [basics.retryAfter, enrichment.retryAfter].filter(
        (wait): wait is number => wait !== null
    );
    if (waits.length === 0) {
        return { ...product, status: 'unavailable' };
    }
    return { ...product, status: 'temporarilyUnavailable', retryAfterSeconds: Math.max(...waits) };
}

async function readEnrichment(
    read: RankWranglerRead,
    product: AmazonProductIdentity
): Promise<Enrichment> {
    try {
        const detail = parseProductDetails(
            await read({ operation: 'get', ...product, include: ['shortName', 'cutoutThumbnail'] })
        );
        assertSameProduct(detail, product);
        return { ok: true, detail };
    } catch (error) {
        const retryAfter = transientRetryAfter(error);
        // Retryable is the expected cold state and is polled; stay quiet for it.
        if (retryAfter === null) {
            warn('Amazon product enrichment failed; serving basics only', error, product);
        }
        return { ok: false, retryAfter };
    }
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

function warn(message: string, error: unknown, product?: AmazonProductIdentity) {
    console.warn(`[haus] ${message}`, {
        asin: product?.asin,
        code:
            error instanceof RankWranglerError || error instanceof McpUpstreamError
                ? error.code
                : undefined,
        error: error instanceof Error ? error.message : String(error),
    });
}
