import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
    installHausRelease,
    parseHausDeployArguments,
} from '../../../scripts/deploy-haus-server.ts';

const sourceRevision = '0123456789abcdef0123456789abcdef01234567';

test('accepts only one exact published artifact install command', () => {
    expect(
        parseHausDeployArguments([
            '--',
            'install',
            '/tmp/haus-server.tar.gz',
            'v1.6.2',
            sourceRevision,
        ])
    ).toEqual({
        artifactPath: '/tmp/haus-server.tar.gz',
        productVersion: '1.6.2',
        sourceRevision,
        versionTag: 'v1.6.2',
    });
    expect(() =>
        parseHausDeployArguments(['install', '/tmp/haus-server.tar.gz', 'main', sourceRevision])
    ).toThrow('Usage');
    expect(() =>
        parseHausDeployArguments(['activate', '/tmp/haus-server.tar.gz', 'v1.6.2', sourceRevision])
    ).toThrow('Usage');
});

test('installs one immutable full-revision release and refuses changed content', async () => {
    const root = mkdtempSync(join(tmpdir(), 'haus-deploy-'));

    try {
        const firstArtifact = makeArtifact(root, 'first');
        const installed = await installHausRelease({
            artifactPath: firstArtifact,
            deployRoot: root,
            productVersion: '1.6.2',
            sourceRevision,
        });
        expect(installed).toBe(join(root, 'releases', sourceRevision));
        expect(statSync(installed).mode & 0o777).toBe(0o755);
        expect(readFileSync(join(installed, 'bin/haus-server'), 'utf8')).toBe('first');

        expect(
            await installHausRelease({
                artifactPath: firstArtifact,
                deployRoot: root,
                productVersion: '1.6.2',
                sourceRevision,
            })
        ).toBe(installed);

        await expect(
            installHausRelease({
                artifactPath: firstArtifact,
                deployRoot: root,
                productVersion: '1.6.3',
                sourceRevision,
            })
        ).rejects.toThrow('product version');

        const changedArtifact = makeArtifact(root, 'changed');
        await expect(
            installHausRelease({
                artifactPath: changedArtifact,
                deployRoot: root,
                productVersion: '1.6.2',
                sourceRevision,
            })
        ).rejects.toThrow('already exists with different content');
        expect(readFileSync(join(installed, 'bin/haus-server'), 'utf8')).toBe('first');
    } finally {
        rmSync(root, { force: true, recursive: true });
    }
});

function makeArtifact(root: string, content: string) {
    const stage = mkdtempSync(join(root, 'stage-'));
    mkdirSync(join(stage, 'bin'));
    writeFileSync(join(stage, 'bin/haus-server'), content);

    const fileDigest = sha256(content);
    const checksums = `${fileDigest}  ./bin/haus-server\n`;
    writeFileSync(join(stage, 'release-files.sha256'), checksums);
    writeFileSync(
        join(stage, 'release.json'),
        `${JSON.stringify({
            contentDigest: sha256(checksums),
            productVersion: '1.6.2',
            releaseId: `1.6.2+git.${sourceRevision.slice(0, 12)}`,
            sourceRevision,
        })}\n`
    );

    const artifactPath = join(root, `fixture-${content}.tar.gz`);
    expect(Bun.spawnSync(['/usr/bin/tar', '-czf', artifactPath, '-C', stage, '.']).exitCode).toBe(
        0
    );
    writeFileSync(
        `${artifactPath}.sha256`,
        `${sha256(readFileSync(artifactPath))}  ${basename(artifactPath)}\n`
    );
    rmSync(stage, { force: true, recursive: true });
    return artifactPath;
}

function sha256(value: Buffer | string) {
    return createHash('sha256').update(value).digest('hex');
}
