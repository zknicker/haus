import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isNewerVersion } from '../update.ts';

/**
 * Best-effort freshness check behind the CLI status line. The latest release
 * version is cached in the data root so repeated commands stay instant; a
 * stale cache triggers one short network check, and failure degrades to the
 * stale value or "unknown" instead of blocking the command.
 */

export type ComputerUpdateStatus =
    | { kind: 'development' }
    | { kind: 'unknown' }
    | { kind: 'up-to-date'; version: string }
    | { currentVersion: string; kind: 'update-available'; latestVersion: string };

const releaseCheckTtlMs = 60 * 60 * 1000;
const releaseCheckTimeoutMs = 1500;

export async function readComputerUpdateStatus(input: {
    currentVersion: string;
    dataRoot: string;
    fetchLatestVersion: (signal: AbortSignal) => Promise<string>;
    now?: () => number;
    sourceRevision: string;
    timeoutMs?: number;
    ttlMs?: number;
}): Promise<ComputerUpdateStatus> {
    if (input.sourceRevision === 'development') {
        return { kind: 'development' };
    }
    const now = input.now ?? Date.now;
    const cache = await readReleaseCheckCache(input.dataRoot);
    const fresh = cache !== null && now() - cache.checkedAt <= (input.ttlMs ?? releaseCheckTtlMs);
    let latestVersion = fresh ? cache.latestVersion : null;
    if (latestVersion === null) {
        try {
            latestVersion = await input.fetchLatestVersion(
                AbortSignal.timeout(input.timeoutMs ?? releaseCheckTimeoutMs)
            );
            await writeReleaseCheckCache(input.dataRoot, {
                checkedAt: now(),
                latestVersion,
            });
        } catch {
            latestVersion = cache?.latestVersion ?? null;
        }
    }
    if (latestVersion === null || !/^\d+\.\d+\.\d+$/u.test(latestVersion)) {
        return { kind: 'unknown' };
    }
    if (isNewerVersion(latestVersion, input.currentVersion)) {
        return { currentVersion: input.currentVersion, kind: 'update-available', latestVersion };
    }
    return { kind: 'up-to-date', version: input.currentVersion };
}

interface ReleaseCheckCache {
    checkedAt: number;
    latestVersion: string;
}

function releaseCheckCachePath(dataRoot: string) {
    return join(dataRoot, 'release-check.json');
}

async function readReleaseCheckCache(dataRoot: string): Promise<ReleaseCheckCache | null> {
    try {
        const value = JSON.parse(await readFile(releaseCheckCachePath(dataRoot), 'utf8')) as {
            checkedAt?: unknown;
            latestVersion?: unknown;
        };
        if (
            !Number.isSafeInteger(value.checkedAt) ||
            typeof value.latestVersion !== 'string' ||
            !/^\d+\.\d+\.\d+$/u.test(value.latestVersion)
        ) {
            return null;
        }
        return { checkedAt: value.checkedAt as number, latestVersion: value.latestVersion };
    } catch {
        return null;
    }
}

async function writeReleaseCheckCache(dataRoot: string, cache: ReleaseCheckCache) {
    try {
        await mkdir(dataRoot, { mode: 0o700, recursive: true });
        await writeFile(releaseCheckCachePath(dataRoot), `${JSON.stringify(cache)}\n`, {
            mode: 0o600,
        });
    } catch {
        // A read-only data root only costs a repeat check next run.
    }
}
