import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    iosUploadFailed,
    readUnshippedIOSVersions,
    recordUnshippedIOS,
    unshippedIOSTag,
} from './unshipped-ios.mjs';

test('a selected iOS upload that did not succeed counts as failed', () => {
    const targets = { computer: false, agent: false, app: false, ios: true, server: true };
    for (const result of ['failure', 'skipped', 'cancelled']) {
        assert.equal(iosUploadFailed({ targets, results: { upload_ios: { result } } }), true);
    }
    assert.equal(iosUploadFailed({ targets, results: {} }), true);
    assert.equal(
        iosUploadFailed({ targets, results: { upload_ios: { result: 'success' } } }),
        false
    );
    assert.equal(
        iosUploadFailed({
            targets: { ...targets, ios: false },
            results: { upload_ios: { result: 'skipped' } },
        }),
        false
    );
});

test('recording unshipped iOS pushes one marker tag and is idempotent', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'haus-unshipped-ios-'));
    try {
        const remote = path.join(directory, 'remote.git');
        const checkout = path.join(directory, 'checkout');
        git(directory, ['init', '--bare', '--quiet', remote]);
        git(directory, ['init', '--quiet', checkout]);
        git(checkout, [
            '-c',
            'user.name=Release Test',
            '-c',
            'user.email=release-test@example.invalid',
            'commit',
            '--allow-empty',
            '--quiet',
            '--message',
            'release source',
        ]);
        git(checkout, ['remote', 'add', 'origin', remote]);
        const sourceRevision = git(checkout, ['rev-parse', 'HEAD']).trim();

        assert.deepEqual(readUnshippedIOSVersions({ cwd: checkout }), []);
        assert.equal(
            recordUnshippedIOS({ version: '20.0.0', sourceRevision, cwd: checkout }),
            true
        );
        assert.equal(
            recordUnshippedIOS({ version: '20.0.0', sourceRevision, cwd: checkout }),
            false
        );
        assert.equal(recordUnshippedIOS({ version: '9.1.0', sourceRevision, cwd: checkout }), true);

        assert.deepEqual(readUnshippedIOSVersions({ cwd: checkout }), ['20.0.0', '9.1.0']);
        assert.equal(
            git(remote, ['rev-parse', `${unshippedIOSTag('20.0.0')}^{commit}`]).trim(),
            sourceRevision
        );
        assert.throws(
            () => recordUnshippedIOS({ version: '20.0.1', sourceRevision: 'HEAD', cwd: checkout }),
            /full lowercase Git SHA/
        );
        assert.throws(() => unshippedIOSTag('latest'), /invalid Haus release version/);
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

function git(cwd, args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
}
