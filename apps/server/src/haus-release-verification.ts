import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { HausReleaseIdentity } from './haus-release-identity.ts';

const revisionPattern = /^[0-9a-f]{40}$/u;

export async function verifyHausRelease(releaseRoot: string, sourceRevision: string) {
    assertHausRevision(sourceRevision);
    const releaseStat = await lstat(releaseRoot);
    if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink()) {
        throw new Error('Haus release directory must be a real directory.');
    }
    await refuseSymlinks(releaseRoot);

    const stored = JSON.parse(
        await readFile(join(releaseRoot, 'release.json'), 'utf8')
    ) as HausReleaseIdentity & { serverVersion?: string };
    const release = { ...stored, serverVersion: stored.serverVersion ?? stored.productVersion };
    if (
        !(
            /^\d+\.\d+\.\d+$/u.test(release.productVersion) &&
            /^\d+\.\d+\.\d+$/u.test(release.serverVersion)
        ) ||
        release.sourceRevision !== sourceRevision ||
        release.releaseId !==
            `${release.serverVersion}+git.${release.sourceRevision.slice(0, 12)}` ||
        !/^[0-9a-f]{64}$/u.test(release.contentDigest)
    ) {
        throw new Error('Haus release identity is invalid.');
    }

    const checksumPath = join(releaseRoot, 'release-files.sha256');
    if ((await sha256(checksumPath)) !== release.contentDigest) {
        throw new Error('Haus release checksum manifest does not match its identity.');
    }
    run('/usr/bin/shasum', ['-a', '256', '-c', 'release-files.sha256'], releaseRoot);
    return release;
}

export function assertHausRevision(value: string) {
    if (!revisionPattern.test(value)) {
        throw new Error('Haus source revision must be a full lowercase Git SHA.');
    }
}

async function refuseSymlinks(root: string) {
    const entries = await Array.fromAsync(
        new Bun.Glob('**/*').scan({ cwd: root, dot: true, onlyFiles: false })
    );
    for (const entry of entries) {
        if ((await lstat(join(root, entry))).isSymbolicLink()) {
            throw new Error('Haus releases cannot contain symbolic links.');
        }
    }
}

async function sha256(path: string) {
    return createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
}

function run(command: string, args: string[], cwd?: string) {
    const result = Bun.spawnSync([command, ...args], {
        cwd,
        stderr: 'pipe',
        stdout: 'pipe',
    });
    if (result.exitCode !== 0) {
        throw new Error(`${basename(command)} failed with exit code ${result.exitCode}.`);
    }
}
