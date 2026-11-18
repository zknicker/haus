import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRetryQuery } from './query-retry.ts';

test('shouldRetryQuery does not retry route-not-found failures', () => {
    assert.equal(
        shouldRetryQuery(0, {
            data: {
                code: 'NOT_FOUND',
                httpStatus: 404,
            },
            message: 'Route "chat.list" not found',
        }),
        false
    );
});

test('shouldRetryQuery allows retry for server-side failures below the retry limit', () => {
    assert.equal(
        shouldRetryQuery(1, {
            data: {
                code: 'INTERNAL_SERVER_ERROR',
                httpStatus: 500,
            },
        }),
        true
    );
});
