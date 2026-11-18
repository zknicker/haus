import assert from 'node:assert/strict';
import test from 'node:test';
import { publishHausSnapshotInOrder } from './publish-haus-snapshot.mjs';
import { hausSnapshotKeys } from './release-snapshot.mjs';

test('publishes and verifies the immutable snapshot before moving latest', async () => {
    const calls = [];
    let immutable = null;
    let latest = null;
    await publishHausSnapshotInOrder(
        {
            promoteLatest: async () => {
                calls.push('promote latest');
                latest = immutable;
            },
            publishImmutable: async () => {
                calls.push('publish immutable');
                immutable = 'snapshot';
            },
            readImmutable: async () => {
                calls.push('read immutable');
                return immutable;
            },
            readLatest: async () => {
                calls.push('read latest');
                return latest;
            },
        },
        'snapshot'
    );
    assert.deepEqual(calls, [
        'read immutable',
        'publish immutable',
        'read immutable',
        'promote latest',
        'read latest',
    ]);
});

test('reuses matching immutable bytes and rejects a conflicting retry', async () => {
    let publishes = 0;
    const operations = {
        promoteLatest: async () => undefined,
        publishImmutable: async () => {
            publishes += 1;
        },
        readImmutable: async () => 'snapshot',
        readLatest: async () => 'snapshot',
    };
    await publishHausSnapshotInOrder(operations, 'snapshot');
    assert.equal(publishes, 0);
    await assert.rejects(
        () => publishHausSnapshotInOrder(operations, 'different'),
        /different bytes/
    );
});

test('uses stable versioned and latest release keys', () => {
    assert.deepEqual(hausSnapshotKeys('1.9.0'), {
        immutable: 'haus/1.9.0.json',
        latest: 'haus/latest.json',
    });
});
