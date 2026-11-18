import { expect, test } from 'bun:test';
import { failureFingerprint } from './failure-fingerprint.ts';

test('the same failure with different ids and numbers shares a fingerprint', () => {
    const first = failureFingerprint(
        'Error 503 for request req_011CXabc12345 (trace 9f86d081884c7d65) session 0b1e7c9a-4a5f-4e7b-9c1d-2f3a4b5c6d7e after 12 retries'
    );
    const second = failureFingerprint(
        'error 504 for request  req_022CYdef67890 (trace a1b2c3d4e5f60718) session 11111111-2222-4333-8444-555555555555 after 3 retries'
    );
    expect(first).toMatch(/^[0-9a-f]{16}$/u);
    expect(first).toBe(second);
});

test('different failures fingerprint differently', () => {
    expect(failureFingerprint('Unknown model gpt-nope')).not.toBe(
        failureFingerprint('Not logged in. Run codex login.')
    );
});

test('blank text has no fingerprint', () => {
    expect(failureFingerprint('  \n ')).toBeUndefined();
});
