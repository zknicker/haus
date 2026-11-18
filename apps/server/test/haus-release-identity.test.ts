import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHausReleaseIdentity } from '../src/haus-release-identity.ts';

test('reads the exact product version, source revision, and artifact digest', () => {
    const root = mkdtempSync(join(tmpdir(), 'haus-release-identity-'));
    const path = join(root, 'release.json');
    const sourceRevision = '0123456789abcdef0123456789abcdef01234567';
    const contentDigest = 'a'.repeat(64);
    writeFileSync(
        path,
        JSON.stringify({
            contentDigest,
            productVersion: '1.4.0',
            releaseId: '1.3.0+git.0123456789ab',
            serverVersion: '1.3.0',
            sourceRevision,
        })
    );

    try {
        expect(readHausReleaseIdentity(path)).toEqual({
            contentDigest,
            productVersion: '1.4.0',
            releaseId: '1.3.0+git.0123456789ab',
            serverVersion: '1.3.0',
            sourceRevision,
        });
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

test('rejects release metadata whose human and operational identities disagree', () => {
    const root = mkdtempSync(join(tmpdir(), 'haus-release-identity-'));
    const path = join(root, 'release.json');
    writeFileSync(
        path,
        JSON.stringify({
            contentDigest: 'a'.repeat(64),
            productVersion: '1.4.0',
            releaseId: '1.4.0+git.wrong',
            sourceRevision: '0123456789abcdef0123456789abcdef01234567',
        })
    );

    try {
        expect(() => readHausReleaseIdentity(path)).toThrow('identity is invalid');
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

test('reads production release identity before opening the Server listener', () => {
    const source = readFileSync(new URL('../src/haus-server.ts', import.meta.url), 'utf8');
    const identityRead = source.indexOf('readHausReleaseIdentity(env.HAUS_RELEASE_MANIFEST)');
    const applicationCreate = source.indexOf(
        'const application = await createHausServerApplication'
    );

    expect(identityRead).toBeGreaterThan(0);
    expect(identityRead).toBeLessThan(applicationCreate);
    expect(identityRead).toBeLessThan(source.indexOf('application.listen'));
});
