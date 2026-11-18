#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
    assertHausRevision,
    verifyHausRelease,
} from '../apps/server/src/haus-release-verification.ts';

const productionRoot = '/Users/zknicker/srv/haus';
const versionTagPattern = /^v(\d+\.\d+\.\d+)$/u;

interface InstallHausReleaseInput {
    artifactPath: string;
    deployRoot: string;
    productVersion: string;
    sourceRevision: string;
}

export function parseHausDeployArguments(args: string[]) {
    const [operation, artifactPath, versionTag, sourceRevision, ...extra] = args.filter(
        (argument) => argument !== '--'
    );
    const versionMatch = versionTag?.match(versionTagPattern);
    if (
        !(
            operation === 'install' &&
            artifactPath &&
            versionMatch &&
            sourceRevision &&
            !extra.length
        )
    ) {
        throw new Error('Usage: haus-server-deploy install ARTIFACT_PATH vX.Y.Z FULL_GIT_SHA');
    }
    assertHausRevision(sourceRevision);
    return {
        artifactPath,
        productVersion: versionMatch[1],
        sourceRevision,
        versionTag,
    };
}

export async function installHausRelease(input: InstallHausReleaseInput) {
    assertHausRevision(input.sourceRevision);
    await verifyArtifactChecksum(input.artifactPath);

    const releasesRoot = join(input.deployRoot, 'releases');
    const releaseRoot = join(releasesRoot, input.sourceRevision);
    await mkdir(releasesRoot, { recursive: true });
    const candidateRoot = await mkdtemp(join(releasesRoot, `.${input.sourceRevision}.`));

    try {
        run('/usr/bin/tar', ['-xzf', input.artifactPath, '-C', candidateRoot]);
        const candidate = await verifyHausRelease(candidateRoot, input.sourceRevision);
        if (candidate.productVersion !== input.productVersion) {
            throw new Error('Haus release product version does not match the published tag.');
        }
        await chmod(candidateRoot, 0o755);

        if (await pathExists(releaseRoot)) {
            const existing = await verifyHausRelease(releaseRoot, input.sourceRevision);
            if (existing.contentDigest !== candidate.contentDigest) {
                throw new Error(
                    `Haus release ${input.sourceRevision} already exists with different content.`
                );
            }
            return releaseRoot;
        }

        await rename(candidateRoot, releaseRoot);
        return releaseRoot;
    } finally {
        await rm(candidateRoot, { force: true, recursive: true });
    }
}

async function main() {
    const { artifactPath, productVersion, sourceRevision } = parseHausDeployArguments(
        process.argv.slice(2)
    );
    const releaseRoot = await installHausRelease({
        artifactPath,
        deployRoot: productionRoot,
        productVersion,
        sourceRevision,
    });
    console.log(`Installed verified Haus Server release at ${releaseRoot}.`);
}

async function verifyArtifactChecksum(artifactPath: string) {
    const checksumSource = await readFile(`${artifactPath}.sha256`, 'utf8');
    const match = checksumSource.match(/^([0-9a-f]{64}) {2}([^/\n]+)\n$/u);
    if (!(match && match[2] === basename(artifactPath))) {
        throw new Error('Haus artifact checksum file is invalid.');
    }
    if ((await sha256(artifactPath)) !== match[1]) {
        throw new Error('Haus artifact checksum does not match.');
    }
}

async function pathExists(path: string) {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

async function sha256(path: string) {
    const hash = createHash('sha256');
    await new Promise<void>((resolve, reject) => {
        createReadStream(path)
            .on('data', (chunk) => hash.update(chunk))
            .on('error', reject)
            .on('end', resolve);
    });
    return hash.digest('hex');
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

if (import.meta.main) {
    await main();
}
