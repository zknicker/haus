#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkComputerReleasePrerequisite } from './check-computer-prerequisite.mjs';
import { findHausServerReleaseAssets } from './haus-server-release-assets.mjs';
import {
    assertReleaseLedger,
    releasePublishesTarget,
    releaseTargetVersion,
} from './release-ledger.mjs';
import {
    assertNoTag,
    createGithubRelease,
    createTag,
    pushReleaseTag,
} from './release-publication.mjs';
import { fail, isSemver, readJson, readText, repoRoot } from './release-utils.mjs';

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
}

const bundleRoot = path.join(repoRoot, 'apps', 'website', 'electron-dist');
const serverReleaseRoot = path.join(repoRoot, 'apps', 'server', 'release');

const main = async () => {
    const version = await readReleaseVersion();
    const tagName = `v${version}`;

    assertVersion(version);
    assertCleanWorktree();
    assertNoTag(tagName);
    run('bun', ['run', 'release:check', '--', '--expect-version', version]);
    const release = await readPublishedRelease(version);
    const serverVersion = releaseTargetVersion(release, 'server');
    const appVersion = releaseTargetVersion(release, 'app');
    const computerRelease = await checkComputerReleasePrerequisite().catch((error) => {
        fail('compatible Haus Computer must be published before Server', {
            message: error instanceof Error ? error.message : String(error),
        });
    });
    console.log(
        `Computer prerequisite: ${computerRelease.version} (protocol ${computerRelease.protocolVersion})`
    );
    const publishApp = releasePublishesTarget(release, 'app');
    const declaredComputerVersion = releaseTargetVersion(release, 'computer');
    if (declaredComputerVersion && declaredComputerVersion !== computerRelease.version) {
        fail('the declared Computer release is not the publicly verified production release', {
            declared: declaredComputerVersion,
            production: computerRelease.version,
        });
    }
    const sourceRevision = readSourceRevision();
    run('bun', ['run', 'build:haus-server-artifact'], {
        env: {
            ...process.env,
            HAUS_SERVER_VERSION: serverVersion,
            HAUS_SOURCE_REVISION: sourceRevision,
        },
    });

    const notesPath = await writeReleaseNotes(version);
    const artifacts = await findReleaseArtifacts({
        appVersion,
        includeDesktop: publishApp,
        serverVersion,
        sourceRevision,
    });

    createTag(tagName, sourceRevision);
    pushReleaseTag(tagName);
    createGithubRelease({ artifacts, notesPath, tagName });
    console.log(`Released ${tagName}`);
};

await main();

function printUsage() {
    console.log(
        [
            'Usage: bun run release:publish',
            '',
            'Builds the Server and each declared release target from the already-merged commit,',
            'pushes the release tag, and creates the GitHub Release.',
        ].join('\n')
    );
}

async function readReleaseVersion() {
    const product = await readJson('packages/haus-api/haus-product.json');
    return product.version;
}

function assertVersion(version) {
    if (!isSemver(version)) {
        fail(`invalid release version: ${version}`);
    }
}

function assertCleanWorktree() {
    const status = runCapture('git', ['status', '--porcelain']);
    if (status.trim()) {
        fail('release publishing requires the already-merged checkout to be clean', {
            status: status.trim(),
        });
    }
}

function readSourceRevision() {
    const checkedOutRevision = runCapture('git', ['rev-parse', 'HEAD']).trim();
    const sourceRevision = process.env.GITHUB_SHA?.trim() || checkedOutRevision;
    if (!/^[0-9a-f]{40}$/u.test(sourceRevision)) {
        fail('release source revision must be a full lowercase Git SHA');
    }
    if (sourceRevision !== checkedOutRevision) {
        fail('GITHUB_SHA must match the already-merged checkout revision', {
            github: sourceRevision,
            checkout: checkedOutRevision,
        });
    }
    return sourceRevision;
}

async function readPublishedRelease(version) {
    try {
        const ledger = await readJson('releases.json');
        const result = assertReleaseLedger(ledger, { requireComplete: true });
        if (result.latest.version !== version) {
            throw new Error(`latest release ledger entry is not Haus ${version}`);
        }
        if (!releasePublishesTarget(result.latest, 'server')) {
            throw new Error(`Haus ${version} does not publish Server`);
        }
        return result.latest;
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
}

async function writeReleaseNotes(version) {
    const notes = extractReleaseNotes(await readText('CHANGELOG.md'), version);
    const notesDirectory = mkdtempSync(path.join(tmpdir(), 'haus-release-'));
    const notesPath = path.join(notesDirectory, `${version}-notes.md`);
    writeFileSync(notesPath, `${notes}\n`, 'utf8');
    return notesPath;
}

function extractReleaseNotes(changelog, version) {
    const headingPattern = /^## v(\d+\.\d+\.\d+) - \d{4}-\d{2}-\d{2}$/gm;
    const headings = Array.from(changelog.matchAll(headingPattern));
    const targetIndex = headings.findIndex((match) => match[1] === version);

    if (targetIndex === -1) {
        fail(`could not find CHANGELOG.md entry for v${version}`);
    }

    const start = headings[targetIndex].index + headings[targetIndex][0].length;
    const end =
        targetIndex + 1 < headings.length ? headings[targetIndex + 1].index : changelog.length;
    const notes = changelog.slice(start, end).trim();

    if (!notes) {
        fail(`CHANGELOG.md entry for v${version} has no body`);
    }

    return notes;
}

async function findReleaseArtifacts({ appVersion, includeDesktop, serverVersion, sourceRevision }) {
    const artifacts = [
        ...(includeDesktop ? await findDesktopArtifacts(appVersion) : []),
        ...(includeDesktop ? [path.join(bundleRoot, 'latest-mac.yml')] : []),
        ...(await findHausServerReleaseAssets({
            releaseRoot: serverReleaseRoot,
            sourceRevision,
            version: serverVersion,
        })),
    ];

    if (includeDesktop && !artifacts.some((artifact) => path.basename(artifact).endsWith('.dmg'))) {
        fail('could not find expected Electron DMG artifact', {
            files: await readdir(bundleRoot),
        });
    }

    return artifacts;
}

async function findDesktopArtifacts(version) {
    const expectedPrefix = `Haus_${version}_`;
    return await findFiles(
        bundleRoot,
        (entry) =>
            entry.startsWith(expectedPrefix) &&
            (entry.endsWith('.dmg') || entry.endsWith('.zip') || entry.endsWith('.blockmap'))
    );
}

async function findFiles(directory, predicate) {
    return (await readdir(directory)).filter(predicate).map((entry) => path.join(directory, entry));
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        env: options.env ?? process.env,
        stdio: 'inherit',
    });

    if (result.error) {
        fail(`${command} failed`, { message: result.error.message });
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function runCapture(command, args) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        env: process.env,
        encoding: 'utf8',
    });

    if (result.error) {
        fail(`${command} failed`, { message: result.error.message });
    }

    if (result.status !== 0) {
        fail(`${command} exited with ${result.status}`, {
            stderr: result.stderr.trim(),
            stdout: result.stdout.trim(),
        });
    }

    return result.stdout;
}
