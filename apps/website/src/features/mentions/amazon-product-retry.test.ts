import { expect, test } from 'bun:test';
import {
    AmazonProductTemporaryError,
    amazonProductRetryDelay,
    retryAmazonProduct,
} from './amazon-product-retry.ts';

test('transient product results retry a bounded number of times', () => {
    const error = new AmazonProductTemporaryError(2);
    expect([0, 1, 2, 3].map((count) => retryAmazonProduct(count, error))).toEqual([
        true,
        true,
        true,
        false,
    ]);
});

test('backoff honors retryAfterSeconds and stays bounded', () => {
    const error = new AmazonProductTemporaryError(2);
    expect([1, 2, 3].map((count) => amazonProductRetryDelay(count, error))).toEqual([
        2000, 4000, 8000,
    ]);
    expect(amazonProductRetryDelay(3, new AmazonProductTemporaryError(30))).toBe(30_000);
    expect(amazonProductRetryDelay(1, new Error('network'))).toBe(1000);
});

test('client errors from the Server are not retried', () => {
    expect(retryAmazonProduct(0, { data: { code: 'FORBIDDEN' } })).toBe(false);
});
