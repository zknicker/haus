#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    archiveComputerApp,
    computerAppExecutable,
    computerAppName,
    writeComputerAppBundle,
} from './computer-app-bundle.mjs';
import { computerArtifactName, computerProtocolVersion } from './computer-release-contract.mjs';
import { fail, repoRoot } from './release-utils.mjs';

export const computerReleaseRoot = path.join(repoRoot, 'apps', 'computer', 'release');
export const computerReleaseAppPath = path.join(computerReleaseRoot, computerAppName);
export const computerReleaseArtifactPath = path.join(computerReleaseRoot, computerArtifactName);
const computerEntitlementsPath = path.join(
    repoRoot,
    'scripts',
    'release',
    'computer-entitlements.plist'
);

export async function buildComputerArtifact(input) {
    const appPath = computerReleaseAppPath;
    await rm(computerReleaseRoot, { force: true, recursive: true });
    await mkdir(computerReleaseRoot, { recursive: true });
    const executablePath = await writeComputerAppBundle(appPath, input);
    run(
        'bun',
        [
            'build',
            'apps/computer/src/index.ts',
            '--compile',
            '--target=bun-darwin-arm64',
            '--outfile',
            executablePath,
            '--env=HAUS_COMPUTER_BUILD_*',
            '--no-compile-autoload-dotenv',
        ],
        {
            ...process.env,
            HAUS_COMPUTER_BUILD_APPLE_SIGNING_IDENTITY: input.appleSigningIdentity,
            HAUS_COMPUTER_BUILD_APPLE_TEAM_ID: input.appleTeamId,
            HAUS_COMPUTER_BUILD_BUNDLE_ID: input.bundleId,
            HAUS_COMPUTER_BUILD_RELEASE_PUBLIC_KEY: input.publicKey,
            HAUS_COMPUTER_BUILD_SOURCE_REVISION: input.sourceRevision,
            HAUS_COMPUTER_BUILD_STANDALONE: '1',
            HAUS_COMPUTER_BUILD_VERSION: input.version,
        }
    );
    // Bun's linker signature can be stale after embedding a large compiled payload.
    // Seal the bundle ad hoc before executing release checks; production signing replaces it.
    run('/usr/bin/codesign', ['--force', '--sign', '-', appPath]);
    await verifyComputerIdentity(executablePath, input);
    verifyComputerReleaseAssets(executablePath);
    return {
        appPath,
        artifactPath: archiveComputerApp(appPath, computerReleaseArtifactPath),
        publicKey: input.publicKey,
    };
}

export async function verifyComputerIdentity(executablePath, expected) {
    const identity = JSON.parse(
        execFileSync(executablePath, ['version'], { encoding: 'utf8' }).trim()
    );
    if (
        identity.version !== expected.version ||
        identity.protocolVersion !== computerProtocolVersion ||
        identity.sourceRevision !== expected.sourceRevision
    ) {
        fail('compiled Computer identity does not match its release', { expected, identity });
    }
}

export function verifyComputerReleaseAssets(executablePath) {
    const output = execFileSync(executablePath, ['__release-check'], {
        encoding: 'utf8',
    }).trim();
    if (output !== 'Haus Computer release assets are ready.') {
        fail('compiled Computer is missing required release assets');
    }
}

export function signAndNotarizeComputer(appPath, input) {
    run('/usr/bin/codesign', [
        '--force',
        '--options',
        'runtime',
        '--timestamp',
        '--entitlements',
        computerEntitlementsPath,
        '--sign',
        input.appleSigningIdentity,
        appPath,
    ]);
    verifyAppleSignature(appPath, input);
    const submission = archiveComputerApp(
        appPath,
        path.join(computerReleaseRoot, 'notarization-submission.zip')
    );
    const notaryArgs = [
        'notarytool',
        'submit',
        submission,
        '--wait',
        '--output-format',
        'json',
        '--apple-id',
        process.env.APPLE_ID,
        '--password',
        process.env.APPLE_APP_SPECIFIC_PASSWORD,
        '--team-id',
        input.appleTeamId,
    ];
    const notarization = runJson('/usr/bin/xcrun', notaryArgs);
    if (!isAcceptedComputerNotarization(notarization)) {
        fail('Apple rejected the Computer notarization submission', notarization);
    }
    console.log(`Apple notarization accepted: ${notarization.id}`);
    run('/usr/bin/xcrun', ['stapler', 'staple', appPath]);
    run('/usr/bin/xcrun', ['stapler', 'validate', appPath]);
    verifyGatekeeperAcceptance(appPath);
    verifyAppleSignature(appPath, input);
    return archiveComputerApp(appPath, computerReleaseArtifactPath);
}

export function isAcceptedComputerNotarization(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof value.id === 'string' &&
        value.id.length > 0 &&
        value.status === 'Accepted'
    );
}

export function verifyAppleSignature(appPath, input) {
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
    const result = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', appPath], {
        encoding: 'utf8',
    });
    const details = `${result.stdout}\n${result.stderr}`;
    if (
        result.status !== 0 ||
        !hasExactLine(details, `Identifier=${input.bundleId}`) ||
        !hasExactLine(details, `TeamIdentifier=${input.appleTeamId}`) ||
        !hasExactLine(details, `Authority=${input.appleSigningIdentity}`)
    ) {
        fail('Computer Apple signing identity does not match release configuration');
    }
    return computerAppExecutable(appPath);
}

function verifyGatekeeperAcceptance(appPath) {
    const result = spawnSync('/usr/sbin/spctl', ['--assess', '--type', 'execute', '-vv', appPath], {
        encoding: 'utf8',
    });
    const details = `${result.stdout}\n${result.stderr}`;
    if (result.status !== 0 || !details.includes('source=Notarized Developer ID')) {
        fail('Gatekeeper does not accept the notarized Haus Computer app', { details });
    }
}

function hasExactLine(output, expected) {
    return output.split(/\r?\n/u).includes(expected);
}

function run(command, args, env = process.env) {
    execFileSync(command, args, { cwd: repoRoot, env, stdio: 'inherit' });
}

function runJson(command, args, env = process.env) {
    const output = execFileSync(command, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        env,
        stdio: ['inherit', 'pipe', 'inherit'],
    });
    return JSON.parse(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    fail('Use bun run computer:release -- --dry-run <version>.');
}
