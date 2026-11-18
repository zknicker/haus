#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    assertPublicHausSnapshot,
    hausSnapshotKeys,
    resolveExpectedPublicHausRelease,
} from './release-snapshot.mjs';
import { readJson } from './release-utils.mjs';

const defaultOrigin = 'https://releases.haus.chat';
const defaultAttempts = 5;
const defaultRetryDelayMs = 2000;
const usage =
    'Usage: bun run release:verify-snapshot -- --version X.Y.Z --source-revision <full sha>';

export async function verifyPublicHausRelease({
    expected,
    origin = defaultOrigin,
    attempts = defaultAttempts,
    retryDelayMs = defaultRetryDelayMs,
    fetchImpl = fetch,
    sleepImpl = sleep,
}) {
    assertPublicHausSnapshot(expected, expected, 'expected public Haus release');
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
        throw new Error('public Haus release verification attempts must be a positive integer');
    }
    if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) {
        throw new Error('public Haus release verification retry delay must be non-negative');
    }

    const baseUrl = new URL(origin);
    const keys = hausSnapshotKeys(expected.version);
    const endpoints = {
        immutable: new URL(`/${keys.immutable}`, baseUrl),
        latest: new URL(`/${keys.latest}`, baseUrl),
    };

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const results = await Promise.allSettled(
            Object.entries(endpoints).map(([name, url]) =>
                verifyEndpoint({ name, url, expected, fetchImpl })
            )
        );
        const failure = results.find((result) => result.status === 'rejected');
        if (!failure) {
            return;
        }
        lastError = failure.reason;
        if (attempt < attempts) {
            await sleepImpl(retryDelayMs);
        }
    }

    throw new Error(
        `public Haus ${expected.version} release snapshots did not verify: ${errorMessage(lastError)}`,
        { cause: lastError }
    );
}

async function verifyEndpoint({ name, url, expected, fetchImpl }) {
    let response;
    try {
        response = await fetchImpl(url, {
            cache: 'no-store',
            headers: { 'cache-control': 'no-cache' },
            redirect: 'follow',
            signal: AbortSignal.timeout(10_000),
        });
    } catch (error) {
        throw new Error(
            `${name} public Haus release snapshot request failed: ${errorMessage(error)}`,
            { cause: error }
        );
    }

    if (
        !(
            response &&
            response.ok === true &&
            Number.isInteger(response.status) &&
            response.status >= 200 &&
            response.status <= 299
        )
    ) {
        throw new Error(
            `${name} public Haus release snapshot returned HTTP ${String(response?.status ?? 'unknown')} after redirects`
        );
    }

    let payload;
    try {
        payload = await response.json();
    } catch (error) {
        throw new Error(
            `${name} public Haus release snapshot returned malformed JSON: ${errorMessage(error)}`,
            { cause: error }
        );
    }

    try {
        assertPublicHausSnapshot(payload, expected, `${name} public Haus release snapshot`);
    } catch (error) {
        throw new Error(
            `${name} public Haus release snapshot verification failed: ${errorMessage(error)}`,
            { cause: error }
        );
    }
}

function parseArguments(args) {
    const values = new Map();
    for (let index = 0; index < args.length; index += 1) {
        const flag = args[index];
        if (flag !== '--version' && flag !== '--source-revision') {
            throw new Error(`${usage}\nunknown argument ${flag}`);
        }
        if (values.has(flag)) {
            throw new Error(`${usage}\nduplicate argument ${flag}`);
        }
        const value = args[index + 1];
        if (!value || value.startsWith('-')) {
            throw new Error(`${usage}\nmissing value for ${flag}`);
        }
        values.set(flag, value);
        index += 1;
    }

    const version = values.get('--version');
    const sourceRevision = values.get('--source-revision');
    if (!(version && sourceRevision)) {
        throw new Error(`${usage}\n--version and --source-revision are required`);
    }

    return { sourceRevision, version };
}

function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

async function main() {
    const { sourceRevision, version } = parseArguments(process.argv.slice(2));
    const expected = resolveExpectedPublicHausRelease(await readJson('releases.json'), {
        sourceRevision,
        version,
    });

    await verifyPublicHausRelease({ expected });
    console.log(
        `Verified public Haus ${version} immutable and latest release snapshots for source ${sourceRevision} at ${defaultOrigin}.`
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`public Haus release verification error: ${errorMessage(error)}`);
        process.exitCode = 1;
    });
}
