import { expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readComputerUpdateStatus } from './update-check.ts';

const revision = 'a'.repeat(40);

async function temporaryRoot() {
    return await mkdtemp(join(tmpdir(), 'haus-update-check-'));
}

test('development builds skip the network entirely', async () => {
    const status = await readComputerUpdateStatus({
        currentVersion: '1.0.0',
        dataRoot: await temporaryRoot(),
        fetchLatestVersion: () => {
            throw new Error('must not fetch');
        },
        sourceRevision: 'development',
    });
    expect(status).toEqual({ kind: 'development' });
});

test('a fresh check reports freshness and caches the release version', async () => {
    const dataRoot = await temporaryRoot();
    let fetches = 0;
    const status = await readComputerUpdateStatus({
        currentVersion: '1.0.0',
        dataRoot,
        fetchLatestVersion: async () => {
            fetches += 1;
            return '1.1.0';
        },
        sourceRevision: revision,
    });
    expect(status).toEqual({
        currentVersion: '1.0.0',
        kind: 'update-available',
        latestVersion: '1.1.0',
    });
    expect(fetches).toBe(1);
    const cache = JSON.parse(await readFile(join(dataRoot, 'release-check.json'), 'utf8'));
    expect(cache.latestVersion).toBe('1.1.0');
});

test('a fresh cache answers without fetching', async () => {
    const dataRoot = await temporaryRoot();
    await writeFile(
        join(dataRoot, 'release-check.json'),
        JSON.stringify({ checkedAt: 1000, latestVersion: '1.0.0' })
    );
    const status = await readComputerUpdateStatus({
        currentVersion: '1.0.0',
        dataRoot,
        fetchLatestVersion: () => {
            throw new Error('must not fetch');
        },
        now: () => 2000,
        sourceRevision: revision,
    });
    expect(status).toEqual({ kind: 'up-to-date', version: '1.0.0' });
});

test('a stale cache refetches and rewrites the cache', async () => {
    const dataRoot = await temporaryRoot();
    await writeFile(
        join(dataRoot, 'release-check.json'),
        JSON.stringify({ checkedAt: 0, latestVersion: '1.0.0' })
    );
    const status = await readComputerUpdateStatus({
        currentVersion: '1.0.0',
        dataRoot,
        fetchLatestVersion: async () => '1.2.0',
        now: () => 10_000,
        sourceRevision: revision,
        ttlMs: 1000,
    });
    expect(status).toEqual({
        currentVersion: '1.0.0',
        kind: 'update-available',
        latestVersion: '1.2.0',
    });
    const cache = JSON.parse(await readFile(join(dataRoot, 'release-check.json'), 'utf8'));
    expect(cache).toEqual({ checkedAt: 10_000, latestVersion: '1.2.0' });
});

test('a failed check degrades to the stale cache, then to unknown', async () => {
    const dataRoot = await temporaryRoot();
    await writeFile(
        join(dataRoot, 'release-check.json'),
        JSON.stringify({ checkedAt: 0, latestVersion: '1.1.0' })
    );
    const failing = () => Promise.reject(new Error('offline'));
    const stale = await readComputerUpdateStatus({
        currentVersion: '1.0.0',
        dataRoot,
        fetchLatestVersion: failing,
        now: () => 10_000,
        sourceRevision: revision,
        ttlMs: 1000,
    });
    expect(stale).toEqual({
        currentVersion: '1.0.0',
        kind: 'update-available',
        latestVersion: '1.1.0',
    });

    const empty = await readComputerUpdateStatus({
        currentVersion: '1.0.0',
        dataRoot: await temporaryRoot(),
        fetchLatestVersion: failing,
        sourceRevision: revision,
    });
    expect(empty).toEqual({ kind: 'unknown' });
});
