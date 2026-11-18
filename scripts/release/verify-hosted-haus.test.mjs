import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyHostedHaus } from './verify-hosted-haus.mjs';

const response = (body, options = {}) => ({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body,
    text: async () => body,
});

test('verifies public health, App shell, and exact hosted version', async () => {
    const paths = [];
    await verifyHostedHaus({
        expectedVersion: '1.2.3',
        attempts: 1,
        fetchImpl: async (url) => {
            paths.push(url.pathname);
            if (url.pathname === '/healthz') {
                return response({ status: 'ok' });
            }
            if (url.pathname === '/') {
                return response(
                    '<div id="root"></div><script src="/assets/index-abc.js"></script>'
                );
            }
            return response('const productVersion="1.2.3";');
        },
    });
    assert.deepEqual(paths, ['/healthz', '/', '/assets/index-abc.js']);
});

test('retries stale hosted App assets and reports the expected version', async () => {
    let assetAttempts = 0;
    await assert.rejects(
        () =>
            verifyHostedHaus({
                expectedVersion: '1.2.3',
                attempts: 2,
                retryDelayMs: 0,
                sleepImpl: async () => {},
                fetchImpl: async (url) => {
                    if (url.pathname === '/healthz') {
                        return response({ status: 'ok' });
                    }
                    if (url.pathname === '/') {
                        return response(
                            '<div id="root"></div><script src="/assets/index-old.js"></script>'
                        );
                    }
                    assetAttempts += 1;
                    return response('const productVersion="1.2.2";');
                },
            }),
        /did not serve 1\.2\.3: hosted Haus App does not contain version 1\.2\.3/
    );
    assert.equal(assetAttempts, 2);
});

test('rejects malformed expected versions before making a request', async () => {
    await assert.rejects(
        () =>
            verifyHostedHaus({
                expectedVersion: 'latest',
                fetchImpl: async () => {
                    throw new Error('must not fetch');
                },
            }),
        /must be X\.Y\.Z/
    );
});
