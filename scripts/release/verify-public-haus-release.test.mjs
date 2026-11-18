import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPublicHausRelease } from './verify-public-haus-release.mjs';

const sourceRevision = 'a'.repeat(40);

function expectedSnapshot() {
    return {
        components: {
            agent: '1.0.0',
            computer: '1.4.9',
            desktopApp: '1.8.22',
            ios: { buildNumber: 6, version: '1.0.5' },
            server: '1.8.38',
        },
        date: '2026-08-28',
        schemaVersion: 1,
        sourceRevision,
        version: '1.9.0',
    };
}

function jsonResponse(payload, status = 200) {
    return {
        json: async () => payload,
        ok: status >= 200 && status <= 299,
        status,
    };
}

test('verifies immutable and latest snapshots with redirect and cache policy', async () => {
    const expected = expectedSnapshot();
    const calls = [];

    await verifyPublicHausRelease({
        attempts: 1,
        expected,
        fetchImpl: async (url, options) => {
            calls.push({ options, path: new URL(url).pathname });
            return jsonResponse(expected);
        },
        origin: 'https://releases.example.test',
    });

    assert.deepEqual(calls.map(({ path }) => path).sort(), [
        '/haus/1.9.0.json',
        '/haus/latest.json',
    ]);
    for (const { options } of calls) {
        assert.equal(options.cache, 'no-store');
        assert.deepEqual(options.headers, { 'cache-control': 'no-cache' });
        assert.equal(options.redirect, 'follow');
        assert.ok(options.signal instanceof AbortSignal);
    }
});

test('requires a final 2xx response and reports the failing endpoint', async () => {
    const expected = expectedSnapshot();

    await assert.rejects(
        () =>
            verifyPublicHausRelease({
                attempts: 1,
                expected,
                fetchImpl: async (url) =>
                    new URL(url).pathname.endsWith('.json') &&
                    !new URL(url).pathname.endsWith('latest.json')
                        ? jsonResponse(null, 307)
                        : jsonResponse(expected),
            }),
        /immutable public Haus release snapshot returned HTTP 307 after redirects/
    );

    await assert.rejects(
        () =>
            verifyPublicHausRelease({
                attempts: 1,
                expected,
                fetchImpl: async () => ({
                    json: async () => expected,
                    ok: true,
                    status: 302,
                }),
            }),
        /public Haus release snapshot returned HTTP 302 after redirects/
    );
});

test('retries the immutable/latest pair as a unit until both match', async () => {
    const expected = expectedSnapshot();
    const counts = new Map();
    let delays = 0;

    await verifyPublicHausRelease({
        attempts: 2,
        expected,
        fetchImpl: async (url) => {
            const pathname = new URL(url).pathname;
            const count = (counts.get(pathname) ?? 0) + 1;
            counts.set(pathname, count);
            if (pathname.endsWith('latest.json') && count === 1) {
                const stale = structuredClone(expected);
                stale.sourceRevision = 'b'.repeat(40);
                return jsonResponse(stale);
            }
            return jsonResponse(expected);
        },
        sleepImpl: async () => {
            delays += 1;
        },
    });

    assert.deepEqual(Object.fromEntries(counts), {
        '/haus/1.9.0.json': 2,
        '/haus/latest.json': 2,
    });
    assert.equal(delays, 1);
});

for (const [field, mutate] of [
    ['version', (snapshot) => (snapshot.version = '1.9.1')],
    ['date', (snapshot) => (snapshot.date = '2026-08-29')],
    ['schemaVersion', (snapshot) => (snapshot.schemaVersion = 2)],
    ['sourceRevision', (snapshot) => (snapshot.sourceRevision = 'b'.repeat(40))],
    ['components', (snapshot) => (snapshot.components.server = '1.8.39')],
]) {
    test(`rejects an immutable snapshot with a different ${field}`, async () => {
        const expected = expectedSnapshot();
        const actual = structuredClone(expected);
        mutate(actual);

        await assert.rejects(
            () =>
                verifyPublicHausRelease({
                    attempts: 1,
                    expected,
                    fetchImpl: async (url) =>
                        new URL(url).pathname.endsWith('latest.json')
                            ? jsonResponse(expected)
                            : jsonResponse(actual),
                }),
            /immutable public Haus release snapshot/
        );
    });
}

test('rejects extra fields and malformed endpoint JSON with endpoint context', async () => {
    const expected = expectedSnapshot();
    const extraField = structuredClone(expected);
    extraField.unexpected = true;

    await assert.rejects(
        () =>
            verifyPublicHausRelease({
                attempts: 1,
                expected,
                fetchImpl: async (url) =>
                    new URL(url).pathname.endsWith('latest.json')
                        ? jsonResponse(expected)
                        : jsonResponse(extraField),
            }),
        /immutable public Haus release snapshot verification failed: immutable public Haus release snapshot has unexpected fields/
    );

    await assert.rejects(
        () =>
            verifyPublicHausRelease({
                attempts: 1,
                expected,
                fetchImpl: async (url) => ({
                    json: async () => {
                        if (new URL(url).pathname.endsWith('latest.json')) {
                            return expected;
                        }
                        throw new SyntaxError('unexpected end of JSON input');
                    },
                    ok: true,
                    status: 200,
                }),
            }),
        /immutable public Haus release snapshot returned malformed JSON/
    );
});

test('validates the canonical expected object before making requests', async () => {
    const expected = expectedSnapshot();
    expected.components.ios = { buildNumber: 0, version: '1.0.5' };
    let requests = 0;

    await assert.rejects(
        () =>
            verifyPublicHausRelease({
                expected,
                fetchImpl: async () => {
                    requests += 1;
                    return jsonResponse(expected);
                },
            }),
        /expected public Haus release iOS component buildNumber must be a positive integer/
    );
    assert.equal(requests, 0);
});
