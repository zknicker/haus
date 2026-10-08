import { shouldRetryQuery } from '../../lib/query-retry.ts';

/** Retries after the first failed read before the lookup reports itself temporarily unavailable. */
const transientRetries = 3;
const fallbackDelayMs = 1000;
const maxDelayMs = 30_000;
/** While the hover card stays open on a lookup that gave up, try again this often. */
export const amazonProductRecoveryMs = 15_000;

/** Server reported a transient upstream problem and when it is worth asking again. */
export class AmazonProductTemporaryError extends Error {
    readonly retryAfterSeconds: number;
    constructor(retryAfterSeconds: number) {
        super('Amazon product details are temporarily unavailable.');
        this.name = 'AmazonProductTemporaryError';
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

/** React Query owns the retry loop: transient results retry a bounded number of times. */
export function retryAmazonProduct(failureCount: number, error: unknown): boolean {
    if (error instanceof AmazonProductTemporaryError) {
        return failureCount < transientRetries;
    }
    return shouldRetryQuery(failureCount, error);
}

/** Exponential backoff that never asks sooner than the Server's `retryAfterSeconds`. */
export function amazonProductRetryDelay(failureCount: number, error: unknown): number {
    const floorMs =
        error instanceof AmazonProductTemporaryError
            ? error.retryAfterSeconds * 1000
            : fallbackDelayMs;
    return Math.min(floorMs * 2 ** Math.max(failureCount - 1, 0), maxDelayMs);
}
