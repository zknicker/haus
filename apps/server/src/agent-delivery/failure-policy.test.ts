import { expect, test } from 'bun:test';
import { shouldRetryFailure } from './failure-policy.ts';

test('does not spend retries on failures that require operator action', () => {
    expect(shouldRetryFailure('authentication')).toBe(false);
    expect(shouldRetryFailure('configuration')).toBe(false);
    expect(shouldRetryFailure('input')).toBe(false);
});

test('retries transient and unclassified failures with the normal bound', () => {
    expect(shouldRetryFailure('rate-limit')).toBe(true);
    expect(shouldRetryFailure('timeout')).toBe(true);
    expect(shouldRetryFailure('transport')).toBe(true);
    expect(shouldRetryFailure('unknown')).toBe(true);
    expect(shouldRetryFailure(undefined)).toBe(true);
});
