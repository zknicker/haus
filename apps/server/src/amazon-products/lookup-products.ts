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
    parseProductSummary,
    RankWranglerError,
    summaryFields,
} from './rankwrangler-payload.ts';

export type RankWranglerRead = (args: Record<string, unknown>) => Promise<unknown>;

const defaultRetryAfterSeconds = 2;

/**
 * One chip summary from one RankWrangler `get`. A transient failure is
 * `temporarilyUnavailable`; any other failure, including an unknown ASIN, is
 * `unavailable`. Never rejects.
 */
export async function lookupProductSummary(
    read: RankWranglerRead,
    product: AmazonProductIdentity
): Promise<AmazonProductResult> {
    try {
        const summary = parseProductSummary(
            await read({ operation: 'get', ...product, include: [...summaryFields] })
        );
        assertSameProduct(summary, product);
        return { status: 'found', product: summary };
    } catch (error) {
        const retryAfter = transientRetryAfter(error);
        if (retryAfter === null) {
            warn('Amazon product summary failed', error);
            return { ...product, status: 'unavailable' };
        }
        // Retryable is retried by the App; stay quiet for it.
        return { ...product, status: 'temporarilyUnavailable', retryAfterSeconds: retryAfter };
    }
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
