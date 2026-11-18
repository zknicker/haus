import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyInstalledHausServerRelease } from '../../../scripts/verify-haus-server-release.ts';

const sourceRevision = '0123456789abcdef0123456789abcdef01234567';

test('the unprivileged deployer verifies independent product and Server identities', async () => {
    const releaseRoot = makeRelease();
    try {
        await expect(
            verifyInstalledHausServerRelease([releaseRoot, 'v2.0.0', sourceRevision])
        ).resolves.toMatchObject({
            productVersion: '2.0.0',
            releaseId: '1.0.0+git.0123456789ab',
            serverVersion: '1.0.0',
            sourceRevision,
        });
    } finally {
        rmSync(releaseRoot, { force: true, recursive: true });
    }
});

test('the unprivileged deployer rejects the wrong published product version', async () => {
    const releaseRoot = makeRelease();
    try {
        await expect(
            verifyInstalledHausServerRelease([releaseRoot, 'v2.0.1', sourceRevision])
        ).rejects.toThrow('does not match the published tag');
    } finally {
        rmSync(releaseRoot, { force: true, recursive: true });
    }
});

function makeRelease() {
    const releaseRoot = mkdtempSync(join(tmpdir(), 'haus-installed-release-'));
    mkdirSync(join(releaseRoot, 'bin'));
    writeFileSync(join(releaseRoot, 'bin/haus-server'), 'server');
    const checksums = `${sha256('server')}  ./bin/haus-server\n`;
    writeFileSync(join(releaseRoot, 'release-files.sha256'), checksums);
    writeFileSync(
        join(releaseRoot, 'release.json'),
        `${JSON.stringify({
            contentDigest: sha256(checksums),
            productVersion: '2.0.0',
            releaseId: '1.0.0+git.0123456789ab',
            serverVersion: '1.0.0',
            sourceRevision,
        })}\n`
    );
    return releaseRoot;
}

function sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
}
