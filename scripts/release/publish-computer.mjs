#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    archiveComputerArtifact,
    buildComputerArtifact,
    signAndNotarizeComputer,
    verifyComputerIdentity,
} from './build-computer-artifact.mjs';
import {
    assertComputerReleaseKey,
    assertNewerComputerVersion,
    computerArtifactName,
    computerProtocolVersion,
    createSignedComputerRelease,
    publicKeyFromPrivate,
    publishComputerInOrder,
    sha256File,
    verifySignedComputerRelease,
} from './computer-release-contract.mjs';
import {
    readComputerReleasePrivateKey,
    readComputerReleasePublicKey,
} from './computer-release-keys.mjs';
import {
    completePublishedComputerRelease,
    promoteInstaller,
    promoteLatest,
    publishImmutableObjects,
    readProductionComputerRelease,
    recoverImmutableComputerArtifact,
    recoverPublishedComputerRelease,
    verifyPublicDescriptor,
    verifyPublicObjects,
} from './computer-release-publication.mjs';
import {
    assertComputerReleaseTagAbsent,
    ensureComputerGithubRelease,
    ensureComputerReleaseTag,
} from './computer-release-tags.mjs';
import { assertReleaseLedger, releaseTargetVersion } from './release-ledger.mjs';
import { fail, isSemver, readJson, repoRoot } from './release-utils.mjs';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const dryRun = args.includes('--dry-run');
const version = args.find((arg) => !arg.startsWith('-'));
const releaseBaseUrl = (
    process.env.HAUS_COMPUTER_RELEASE_BASE_URL ?? 'https://releases.haus.chat/computer'
).replace(/\/+$/u, '');

await main();

async function main() {
    if (!(version && isSemver(version))) {
        fail('usage: bun run computer:release [-- --dry-run] <X.Y.Z>');
    }
    requireMacArm64();
    const sourceRevision = git('rev-parse', 'HEAD').trim();
    const privateKey =
        readComputerReleasePrivateKey() ??
        (dryRun
            ? generateKeyPairSync('ed25519').privateKey.export({
                  format: 'pem',
                  type: 'pkcs8',
              })
            : requiredEnv('HAUS_COMPUTER_RELEASE_PRIVATE_KEY').replaceAll('\\n', '\n'));
    const releasePublicKey = dryRun
        ? publicKeyFromPrivate(privateKey)
        : (readComputerReleasePublicKey() ?? requiredEnv('HAUS_COMPUTER_RELEASE_PUBLIC_KEY'));
    assertComputerReleaseKey(privateKey, releasePublicKey);
    const appleTeamId = dryRun
        ? (process.env.APPLE_TEAM_ID ?? 'DRYRUN0000')
        : requiredEnv('APPLE_TEAM_ID');
    const appleSigningIdentity = dryRun
        ? (configuredSigningIdentity() ?? 'Developer ID Application: Haus (DRYRUN0000)')
        : requiredSigningIdentity();
    assertSource(sourceRevision);
    const s3Root = dryRun ? null : requiredEnv('HAUS_RELEASE_S3_URI').replace(/\/+$/u, '');
    if (!dryRun) {
        await assertPublishState(version);
        requirePublishingEnvironment();
        const production = await readProductionComputerRelease(
            `${releaseBaseUrl}/latest.json`,
            releasePublicKey
        );
        const published = await recoverPublishedComputerRelease({
            appleSigningIdentity,
            appleTeamId,
            production,
            s3Root,
            sourceRevision,
            version,
        });
        if (published) {
            await completePublishedComputerRelease({
                ...published,
                installerPath: await renderInstaller({ appleSigningIdentity, appleTeamId }),
                sourceRevision,
                version,
            });
            console.log(
                `Computer ${version} was already published; completed computer-v${version}.`
            );
            return;
        }
        assertPublishableComputerVersion(version, production);
        assertComputerReleaseTagAbsent(version);
        run('bun', ['run', 'release:check']);
    }
    run('bun', ['run', '--filter', '@haus/api', 'typecheck']);
    run('bun', ['run', '--filter', '@haus/computer', 'test']);
    run('bun', ['run', '--filter', '@haus/computer', 'typecheck']);
    const recoveredArtifactPath = dryRun
        ? null
        : await recoverImmutableComputerArtifact({
              appleSigningIdentity,
              appleTeamId,
              s3Root,
              sourceRevision,
              version,
          });
    const built = recoveredArtifactPath
        ? { artifactPath: recoveredArtifactPath, publicKey: releasePublicKey }
        : await buildComputerArtifact({
              appleSigningIdentity,
              appleTeamId,
              publicKey: releasePublicKey,
              sourceRevision,
              version,
          });
    if (dryRun) {
        console.log(`Computer ${version} dry run passed: ${built.artifactPath}`);
        return;
    }
    const notarizationArchive = recoveredArtifactPath
        ? archiveComputerArtifact(built.artifactPath)
        : signAndNotarizeComputer(built.artifactPath, {
              appleSigningIdentity,
              appleTeamId,
          });
    await verifyComputerIdentity(built.artifactPath, { sourceRevision, version });
    const release = {
        artifactUrl: `${releaseBaseUrl}/${version}/${computerArtifactName}`,
        protocolVersion: computerProtocolVersion,
        sha256: await sha256File(built.artifactPath),
        sourceRevision,
        version,
    };
    const descriptor = createSignedComputerRelease(release, privateKey);
    verifySignedComputerRelease(descriptor, built.publicKey);
    const descriptorPath = path.join(path.dirname(built.artifactPath), 'release.json');
    await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    const installerPath = await renderInstaller({ appleSigningIdentity, appleTeamId });
    await publishComputerInOrder({
        promoteLatest: async () => promoteLatest(descriptorPath, s3Root),
        publishImmutable: async () =>
            await publishImmutableObjects({
                artifactPath: built.artifactPath,
                descriptorPath,
                installerPath,
                s3Root,
                version,
            }),
        verifyImmutable: async () =>
            await verifyPublicObjects({
                appleSigningIdentity,
                appleTeamId,
                descriptor,
                publicKey: built.publicKey,
                releaseBaseUrl,
                sourceRevision,
                version,
            }),
        verifyLatest: async () =>
            await verifyPublicDescriptor(
                `${releaseBaseUrl}/latest.json`,
                descriptor,
                built.publicKey
            ),
    });
    await promoteInstaller(installerPath, { releaseBaseUrl, s3Root });
    ensureComputerReleaseTag(version, sourceRevision);
    ensureComputerGithubRelease(version, {
        assets: [built.artifactPath, descriptorPath, installerPath, notarizationArchive],
        sourceRevision,
    });
    console.log(`Published and verified computer-v${version}.`);
}

async function renderInstaller(input) {
    const template = await readFile(
        path.join(repoRoot, 'scripts', 'release', 'install-haus-computer.sh'),
        'utf8'
    );
    const rendered = template
        .replaceAll('__HAUS_APPLE_TEAM_ID__', input.appleTeamId)
        .replaceAll('__HAUS_APPLE_SIGNING_IDENTITY__', input.appleSigningIdentity);
    const installerPath = path.join(repoRoot, 'apps', 'computer', 'release', 'install.sh');
    await writeFile(installerPath, rendered, { mode: 0o755 });
    return installerPath;
}

function assertPublishableComputerVersion(releaseVersion, production) {
    if (production) {
        assertNewerComputerVersion(releaseVersion, production.release.version);
        return;
    }
    if (remoteComputerTags().length > 0) {
        fail('production Computer descriptor is missing after an earlier Computer release');
    }
}

async function assertPublishState(releaseVersion) {
    if (git('status', '--porcelain').trim()) {
        fail('Computer publishing requires a clean worktree');
    }
    const packageJson = await readJson('apps/computer/package.json');
    if (packageJson.version !== releaseVersion) {
        fail(`apps/computer/package.json must be version ${releaseVersion}`);
    }
    const ledger = await readJson('releases.json');
    try {
        const result = assertReleaseLedger(ledger, { requireComplete: true });
        const declaredVersion = releaseTargetVersion(result.latest, 'computer');
        if (declaredVersion !== releaseVersion) {
            throw new Error(`release ledger must publish Computer ${releaseVersion}`);
        }
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
}

function remoteComputerTags() {
    return git('ls-remote', '--tags', 'origin', 'refs/tags/computer-v*')
        .split('\n')
        .filter(Boolean);
}

function assertSource(sourceRevision) {
    if (!/^[a-f0-9]{40}$/u.test(sourceRevision)) {
        fail('Computer release source must be one exact full Git revision');
    }
}

function requirePublishingEnvironment() {
    requiredEnv('HAUS_RELEASE_S3_URI');
    requiredEnv('APPLE_ID');
    requiredEnv('APPLE_APP_SPECIFIC_PASSWORD');
    run('gh', ['auth', 'status']);
}

function configuredSigningIdentity() {
    return process.env.CSC_NAME?.trim() || process.env.APPLE_SIGNING_IDENTITY?.trim();
}

function requiredSigningIdentity() {
    const value = configuredSigningIdentity();
    if (!value) {
        fail('missing CSC_NAME or APPLE_SIGNING_IDENTITY keychain identity');
    }
    return value;
}

function requireMacArm64() {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') {
        fail('Computer releases build only on Apple Silicon macOS');
    }
}

function requiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        fail(`missing ${name}`);
    }
    return value;
}

function git(...gitArgs) {
    return execFileSync('git', gitArgs, { cwd: repoRoot, encoding: 'utf8' });
}

function run(command, commandArgs) {
    execFileSync(command, commandArgs, { cwd: repoRoot, env: process.env, stdio: 'inherit' });
}
