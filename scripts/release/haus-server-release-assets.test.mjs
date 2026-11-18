import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findHausServerReleaseAssets } from './haus-server-release-assets.mjs';

const sourceRevision = '0123456789abcdef0123456789abcdef01234567';
const version = '1.7.0';

test('returns only the checksum-verified Server assets for the exact release revision', async () => {
    const releaseRoot = await mkdtemp(path.join(tmpdir(), 'haus-server-assets-'));
    try {
        const artifactName = 'haus-server-1.7.0+git.0123456789ab-aarch64-apple-darwin.tar.gz';
        const artifactPath = path.join(releaseRoot, artifactName);
        const artifact = Buffer.from('verified Server artifact');
        await writeFile(artifactPath, artifact);
        await writeFile(
            `${artifactPath}.sha256`,
            `${createHash('sha256').update(artifact).digest('hex')}  ${artifactName}\n`
        );

        assert.deepEqual(
            await findHausServerReleaseAssets({ releaseRoot, sourceRevision, version }),
            [artifactPath, `${artifactPath}.sha256`]
        );

        await writeFile(`${artifactPath}.sha256`, `${'0'.repeat(64)}  ${artifactName}\n`);
        await assert.rejects(
            findHausServerReleaseAssets({ releaseRoot, sourceRevision, version }),
            /checksum does not match/
        );
    } finally {
        await rm(releaseRoot, { force: true, recursive: true });
    }
});
