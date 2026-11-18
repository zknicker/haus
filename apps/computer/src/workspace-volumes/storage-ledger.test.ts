import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withStorageLock } from './storage-ledger.ts';

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
