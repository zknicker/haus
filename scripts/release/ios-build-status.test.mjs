import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    assertIOSBuildProcessed,
    releaseState,
    waitForIOSBuildStatus,
    writeIOSBuildStatusErrorSummary,
    writeIOSBuildStatusSummary,
} from './ios-build-status.mjs';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

test('waits for the exact build to finish processing', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'haus-ios-status-'));
    const keyPath = path.join(directory, 'AuthKey_TEST.p8');
    writeFileSync(keyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }));
    let buildRequests = 0;
    let clock = 0;
    try {
        const build = await waitForIOSBuildStatus({
            buildNumber: 15,
            environment: {
                APPLE_API_ISSUER: 'issuer',
                APPLE_API_KEY_ID: 'key',
                APPLE_API_KEY_PATH: keyPath,
            },
            fetchImpl: async (url) => {
                if (url.pathname.endsWith('/apps')) {
                    return response({ data: [{ id: 'app-id' }] });
                }
                buildRequests += 1;
                return response(buildDocument(buildRequests === 1 ? 'PROCESSING' : 'VALID'));
            },
            now: () => clock,
            pollIntervalMs: 10,
            sleep: async (milliseconds) => {
                clock += milliseconds;
            },
            timeoutMs: 30,
            version: '1.3.1',
        });
        assert.equal(buildRequests, 2);
        assert.equal(build.processingState, 'VALID');
        assert.equal(releaseState(build.processingState), 'processed');
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

test('Server publication requires a processed, unexpired iPhone build', () => {
    const build = { buildNumber: 15, expired: false, version: '1.3.1' };
    for (const processingState of ['PROCESSING', 'NOT_FOUND', 'FAILED', 'INVALID']) {
        assert.throws(
            () => assertIOSBuildProcessed({ ...build, processingState }),
            /Server publication requires a processed, unexpired build/
        );
    }
    assert.throws(
        () => assertIOSBuildProcessed({ ...build, expired: true, processingState: 'VALID' }),
        /expired/
    );
    assert.doesNotThrow(() => assertIOSBuildProcessed({ ...build, processingState: 'VALID' }));
});

test('reports processing without inventing distribution evidence', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'haus-ios-summary-'));
    const summaryPath = path.join(directory, 'summary');
    try {
        writeIOSBuildStatusSummary(
            { buildNumber: 15, processingState: 'PROCESSING', version: '1.3.1' },
            summaryPath
        );
        const summary = readFileSync(summaryPath, 'utf8');
        assert.match(summary, /iOS 1\.3\.1 \(15\): \*\*processing\*\* \(PROCESSING\)/);
        assert.doesNotMatch(summary, /distributed/iu);
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

test('records a read-only retry when processing evidence is unavailable', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'haus-ios-summary-'));
    const summaryPath = path.join(directory, 'summary');
    try {
        writeIOSBuildStatusErrorSummary(summaryPath);
        assert.match(
            readFileSync(summaryPath, 'utf8'),
            /Processing evidence unavailable; retry the read-only status probe\./
        );
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

function buildDocument(processingState) {
    return {
        data: [
            {
                attributes: {
                    expired: false,
                    processingState,
                    uploadedDate: '2026-08-31T20:00:00Z',
                    usesNonExemptEncryption: false,
                },
                relationships: { preReleaseVersion: { data: { id: 'release-id' } } },
            },
        ],
        included: [
            { attributes: { version: '1.3.1' }, id: 'release-id', type: 'preReleaseVersions' },
        ],
    };
}

function response(document) {
    return { json: async () => document, ok: true };
}
