#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAppStoreConnectToken, IOS_BUNDLE_ID } from './ios-provisioning-profile.mjs';

const appStoreConnectEndpoint = 'https://api.appstoreconnect.apple.com/v1';
const terminalFailureStates = new Set(['FAILED', 'INVALID']);

export async function waitForIOSBuildStatus(options) {
    const environment = options.environment ?? process.env;
    const fetchImpl = options.fetchImpl ?? fetch;
    const now = options.now ?? Date.now;
    const sleep =
        options.sleep ??
        ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const timeoutMs = options.timeoutMs ?? 0;
    const pollIntervalMs = options.pollIntervalMs ?? 15_000;
    const deadline = now() + timeoutMs;
    const credentials = readCredentials(environment);
    const token = createAppStoreConnectToken({ ...credentials, now: now() });
    const request = (url) => fetchDocument(url, token, fetchImpl, options.signal);
    const appId = await findAppId(request);

    while (true) {
        const build = await findBuild(request, appId, options.version, options.buildNumber);
        if (
            build?.processingState === 'VALID' ||
            terminalFailureStates.has(build?.processingState)
        ) {
            return build;
        }
        if (now() >= deadline) {
            return build ?? pendingBuild(options.version, options.buildNumber);
        }
        await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - now())));
    }
}

export function writeIOSBuildStatusSummary(build, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
    if (!summaryPath) {
        return;
    }
    appendFileSync(
        summaryPath,
        [
            '### iOS App Store Connect',
            '',
            `iOS ${build.version} (${build.buildNumber}): **${releaseState(build.processingState)}** (${build.processingState})`,
            '',
        ].join('\n'),
        'utf8'
    );
}

export function writeIOSBuildStatusErrorSummary(summaryPath = process.env.GITHUB_STEP_SUMMARY) {
    if (!summaryPath) {
        return;
    }
    appendFileSync(
        summaryPath,
        [
            '### iOS App Store Connect',
            '',
            'Processing evidence unavailable; retry the read-only status probe.',
            '',
        ].join('\n'),
        'utf8'
    );
}

export function releaseState(processingState) {
    if (processingState === 'VALID') {
        return 'processed';
    }
    if (terminalFailureStates.has(processingState)) {
        return 'failed';
    }
    return 'processing';
}

async function findAppId(request) {
    const url = new URL(`${appStoreConnectEndpoint}/apps`);
    url.searchParams.set('filter[bundleId]', IOS_BUNDLE_ID);
    url.searchParams.set('fields[apps]', 'bundleId');
    const document = await request(url);
    const apps = Array.isArray(document?.data) ? document.data : [];
    if (apps.length !== 1) {
        throw new Error(
            `expected exactly one App Store app for ${IOS_BUNDLE_ID}, found ${apps.length}`
        );
    }
    return apps[0].id;
}

async function findBuild(request, appId, version, buildNumber) {
    const url = new URL(`${appStoreConnectEndpoint}/builds`);
    url.searchParams.set('filter[app]', appId);
    url.searchParams.set('filter[version]', String(buildNumber));
    url.searchParams.set('include', 'preReleaseVersion');
    url.searchParams.set(
        'fields[builds]',
        'version,uploadedDate,processingState,expired,usesNonExemptEncryption,preReleaseVersion'
    );
    url.searchParams.set('fields[preReleaseVersions]', 'version');
    const document = await request(url);
    const releases = new Map(
        (document.included ?? [])
            .filter((entry) => entry?.type === 'preReleaseVersions')
            .map((entry) => [entry.id, entry.attributes?.version])
    );
    const builds = (document.data ?? []).filter((entry) => {
        const releaseId = entry.relationships?.preReleaseVersion?.data?.id;
        return releases.get(releaseId) === version;
    });
    if (builds.length > 1) {
        throw new Error(`found multiple App Store builds for iOS ${version} (${buildNumber})`);
    }
    if (builds.length === 0) {
        return null;
    }
    const attributes = builds[0].attributes;
    return {
        buildNumber,
        expired: attributes.expired,
        processingState: attributes.processingState,
        uploadedDate: attributes.uploadedDate,
        usesNonExemptEncryption: attributes.usesNonExemptEncryption,
        version,
    };
}

async function fetchDocument(url, token, fetchImpl, signal) {
    const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        throw new Error(`App Store Connect request failed with status ${response.status}`);
    }
    return response.json();
}

function pendingBuild(version, buildNumber) {
    return {
        buildNumber,
        expired: false,
        processingState: 'NOT_FOUND',
        uploadedDate: null,
        usesNonExemptEncryption: null,
        version,
    };
}

function readCredentials(environment) {
    const apiKeyId = environment.APPLE_API_KEY_ID;
    const issuerId = environment.APPLE_API_ISSUER;
    const keyPath = environment.APPLE_API_KEY_PATH;
    const privateKey =
        environment.HAUS_RELEASE_APP_STORE_CONNECT_PRIVATE_KEY ??
        (keyPath ? readFileSync(path.resolve(keyPath), 'utf8') : undefined);
    if (!(apiKeyId && issuerId && privateKey)) {
        throw new Error(
            'App Store Connect private key, APPLE_API_KEY_ID, and APPLE_API_ISSUER are required'
        );
    }
    return { apiKeyId, issuerId, privateKey };
}

function parseArgs(argv) {
    const requireProcessed = argv.at(-1) === '--require-processed';
    const values = requireProcessed ? argv.slice(0, -1) : argv;
    const [version, buildFlag, buildValue, waitFlag, waitValue, ...extra] = values;
    if (extra.length > 0) {
        throw new Error('Unexpected iOS build status arguments');
    }
    if (!/^\d+\.\d+\.\d+$/u.test(version ?? '') || buildFlag !== '--build-number') {
        throw new Error(
            'Usage: ios-build-status.mjs <version> --build-number <number> [--wait-seconds <seconds>] [--require-processed]'
        );
    }
    const buildNumber = Number.parseInt(buildValue, 10);
    if (!(Number.isSafeInteger(buildNumber) && buildNumber > 0)) {
        throw new Error('build number must be a positive integer');
    }
    let waitSeconds = 0;
    if (waitFlag !== undefined) {
        waitSeconds = Number.parseInt(waitValue, 10);
        if (
            waitFlag !== '--wait-seconds' ||
            !(Number.isSafeInteger(waitSeconds) && waitSeconds >= 0)
        ) {
            throw new Error('wait seconds must be a non-negative integer');
        }
    }
    return { buildNumber, requireProcessed, version, waitSeconds };
}

export function assertIOSBuildProcessed(build) {
    if (build.processingState !== 'VALID' || build.expired) {
        throw new Error(
            `iOS ${build.version} (${build.buildNumber}) is ${build.expired ? 'expired' : build.processingState}; Server publication requires a processed, unexpired build`
        );
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const build = await waitForIOSBuildStatus({
        buildNumber: args.buildNumber,
        timeoutMs: args.waitSeconds * 1000,
        version: args.version,
    });
    writeIOSBuildStatusSummary(build);
    console.log(JSON.stringify({ ...build, releaseState: releaseState(build.processingState) }));
    if (args.requireProcessed) {
        assertIOSBuildProcessed(build);
    }
    if (terminalFailureStates.has(build.processingState)) {
        process.exitCode = 1;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
