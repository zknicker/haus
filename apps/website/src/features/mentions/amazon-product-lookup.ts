import type { AmazonProductDetail, AmazonProductResult, AmazonProductSummary } from '@haus/api';

/** What a summary read settles with; transient results are thrown and retried instead. */
export type SettledAmazonProduct = Exclude<
    AmazonProductResult,
    { status: 'temporarilyUnavailable' }
> | null;

/**
 * The chip renders in every state; only its label, image, and hover copy change.
 * `retrying` and `temporarilyUnavailable` are transient upstream problems;
 * `unavailable` is final. A Server without RankWrangler renders no chip at all.
 */
export type AmazonProductLookup =
    | { status: 'loading' }
    | { status: 'retrying' }
    | { status: 'temporarilyUnavailable' }
    | { status: 'unavailable' }
    | {
          status: 'ready';
          /** `price` arrives with the detail read when the preview opens. */
          product: AmazonProductSummary & { price?: AmazonProductDetail['price'] };
          detailFailed: boolean;
      };

export interface AmazonProductQueryState {
    data: SettledAmazonProduct | undefined;
    /** Fetches that gave up; survives refetches, unlike the query's error status. */
    errorUpdateCount: number;
    /** Failures of the current fetch, including retries in flight. */
    failureCount: number;
}

/**
 * Settled data wins; a Server that lost its RankWrangler connection settles
 * `null`, which reads as unavailable. Without data, a lookup that ever gave up stays
 * `temporarilyUnavailable` through later refetches, so the hover card never
 * falls back to bare loading copy after explaining a problem.
 */
export function amazonProductLookupState(
    summary: AmazonProductQueryState
):
    | Exclude<AmazonProductLookup, { status: 'ready' }>
    | { status: 'found'; product: AmazonProductSummary } {
    if (summary.data?.status === 'found') {
        return summary.data;
    }
    if (summary.data === null || summary.data?.status === 'unavailable') {
        return { status: 'unavailable' };
    }
    if (summary.errorUpdateCount > 0) {
        return { status: 'temporarilyUnavailable' };
    }
    if (summary.failureCount > 0) {
        return { status: 'retrying' };
    }
    return { status: 'loading' };
}
