import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reserveWorkspace, withStorageLock } from './storage-ledger.ts';

test('concurrent reservations cannot overcommit the persisted Computer budget', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-ledger-'));
    const file = join(root, 'workspace-storage.json');
    const options = {
        capacityBytes: 128 * 1024 ** 2,
        cacheBytes: 1024 ** 2,
        reserveBytes: 1024 ** 2,
    };
    await writeFile(file, JSON.stringify({ budgetBytes: 256 * 1024 ** 2, allocations: {} }));
    try {
        const results = await Promise.allSettled(
            ['one', 'two'].map((id) =>
                withStorageLock(root, () => reserveWorkspace(root, join(root, id), options))
            )
        );
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
        const ledger = JSON.parse(await readFile(file, 'utf8'));
        expect(Object.keys(ledger.allocations)).toHaveLength(1);
        expect(ledger.budgetBytes).toBe(256 * 1024 ** 2);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

test('a lock left by a dead owner is reclaimed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-ledger-stale-'));
    // pid 2^22 + 1 exceeds Linux and macOS pid ranges, so no process owns it.
    await writeFile(join(root, 'workspace-storage.lock'), `${2 ** 22 + 1}\n`);
    try {
        expect(await withStorageLock(root, () => Promise.resolve('acquired'))).toBe('acquired');
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});
