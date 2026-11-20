import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { calculateReleaseImpact } from './release-impact.mjs';
import { readUnshippedIOSVersions } from './unshipped-ios.mjs';
import {
    assertSelectedJobResults,
    iosUploadWarning,
    preflightRelease,
    writeReleaseSummary,
} from './verify-release.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(repositoryRoot, '.github/workflows/release.yml'), 'utf8');
const sha = (character) => character.repeat(40);

test('an unshipped iOS release does not become the iOS baseline', async () => {
    const iosLedger = [
        {
            version: '1.8.24',
            date: '2026-08-26',
            targets: {
                server: '1.8.24',
                app: '1.8.24',
                ios: { version: '1.0.4', buildNumber: 5 },
                computer: '1.4.8',
            },
        },
        {
            version: '1.8.26',
            date: '2026-08-28',
            targets: {
                server: '1.8.26',
                app: null,
                ios: { version: '1.0.5', buildNumber: 6 },
                computer: null,
            },
        },
    ];
    const tags = {
        'computer-v1.4.8': sha('c'),
        'v1.8.24': sha('a'),
        'v1.8.26': sha('d'),
    };
    const listChangedFiles = async (before) =>
        before === sha('a') ? ['apps/ios-swift/Sources/Haus/HausApp.swift'] : [];

    const shipped = await calculateReleaseImpact({
        ledger: iosLedger,
        resolveTag: async (tag) => tags[tag] ?? null,
        listChangedFiles,
    });
    assert.equal(shipped.targets.ios.baseline.tag, 'v1.8.26');
    assert.equal(shipped.targets.ios.status, 'unchanged');

    const unshipped = await calculateReleaseImpact({
        ledger: iosLedger,
        resolveTag: async (tag) => ({ ...tags, 'unshipped/ios/v1.8.26': sha('d') })[tag] ?? null,
        listChangedFiles,
    });
    assert.equal(unshipped.targets.ios.baseline.tag, 'v1.8.24');
    assert.equal(unshipped.targets.ios.status, 'changed');
    assert.equal(unshipped.targets.server.baseline.tag, 'v1.8.26');
});

test('a failed iOS upload warns and finishes the release without iOS', () => {
    const targets = { computer: false, agent: false, app: false, ios: true, server: true };
    const results = {
        upload_ios: { result: 'failure' },
        publish_server: { result: 'success' },
        promote_server: { result: 'success' },
    };
    assert.doesNotThrow(() => assertSelectedJobResults({ targets, results }));
    assert.match(
        iosUploadWarning({ results, releaseVersion: '20.0.0' }),
        /^::warning title=iOS did not ship::Upload iOS ended failure\. Haus 20\.0\.0 continues/
    );

    const directory = mkdtempSync(path.join(tmpdir(), 'haus-release-test-'));
    try {
        const summaryPath = path.join(directory, 'summary');
        writeReleaseSummary({
            summaryPath,
            verification: { message: 'verified release' },
            targets,
            iosShipped: false,
        });
        const summary = readFileSync(summaryPath, 'utf8');
        assert.match(summary, /\| iOS \| not shipped \|/);
        assert.match(summary, /\| Server \| published \|/);
        assert.match(summary, /> \[!WARNING\]\n> iOS did not ship\./);
        assert.throws(
            () =>
                writeReleaseSummary({
                    summaryPath,
                    verification: { message: 'verified release' },
                    targets,
                }),
            /whether iOS shipped/
        );
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

test('Server publication does not wait for or require the iOS upload', () => {
    const publishServer = workflow.slice(
        workflow.indexOf('\n  publish_server:\n'),
        workflow.indexOf('\n  promote_server:\n')
    );
    assert.match(publishServer, /name: Publish Server/);
    assert.doesNotMatch(publishServer, /upload_ios|publish_ios|ios-build-status/);
    assert.match(workflow, /finalize_release:[\s\S]*?needs:[\s\S]*?- upload_ios/);
});

test('preflight records unshipped iOS even when another selected job also failed', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'haus-release-preflight-'));
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
        const targets = { computer: false, agent: false, app: true, ios: true, server: true };

        assert.throws(
            () =>
                preflightRelease({
                    targets,
                    results: {
                        publish_app: { result: 'failure' },
                        upload_ios: { result: 'failure' },
                        publish_server: { result: 'skipped' },
                        promote_server: { result: 'skipped' },
                    },
                    releaseVersion: '20.0.0',
                    sourceRevision,
                    cwd: checkout,
                }),
            /selected release job publish_app ended failure/
        );
        assert.deepEqual(readUnshippedIOSVersions({ cwd: checkout }), ['20.0.0']);

        assert.doesNotThrow(() =>
            preflightRelease({
                targets,
                results: {
                    publish_app: { result: 'success' },
                    upload_ios: { result: 'failure' },
                    publish_server: { result: 'success' },
                    promote_server: { result: 'success' },
                },
                releaseVersion: '20.0.0',
                sourceRevision,
                cwd: checkout,
            })
        );
        assert.deepEqual(readUnshippedIOSVersions({ cwd: checkout }), ['20.0.0']);
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

function git(cwd, args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' });
}
