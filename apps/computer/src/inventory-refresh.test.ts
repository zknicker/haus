import { expect, test } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectInventory } from './inventory.ts';
import { refreshRuntimeInventory } from './inventory-refresh.ts';

test('manual refresh discovers a runtime installed after the initial inventory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-inventory-refresh-'));
    try {
        expect(detectInventory({ searchPath: root }).runtimes).toEqual([]);
        const executable = join(root, 'grok');
        await writeFile(executable, '#!/bin/sh\necho "grok 1.0"\n');
        await chmod(executable, 0o755);
        const result = await refreshRuntimeInventory('req_refresh', { searchPath: root });
        expect(result).toMatchObject({
            requestId: 'req_refresh',
            status: 'refreshed',
            runtimes: [{ id: 'grok-build', models: [{ id: 'grok-4.6' }, { id: 'grok-4.5' }] }],
        });
        await rm(executable);
        expect(await refreshRuntimeInventory('req_removed', { searchPath: root })).toMatchObject({
            status: 'refreshed',
            runtimes: [],
        });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('manual refresh reports failure if the refreshed health cannot be published', async () => {
    const { handleInventoryRefresh } = await import('./inventory-refresh.ts');
    const frames: unknown[] = [];
    const work: Promise<unknown>[] = [];
    handleInventoryRefresh(
        { requestId: 'req_status', type: 'inventory-refresh-request' },
        {
            send: (frame) => {
                frames.push(frame);
                return true;
            },
            track: (promise) => {
                work.push(promise);
                return promise;
            },
            refreshUsage: async () => {},
            refreshReport: () => Promise.reject(new Error('fixture report unavailable')),
        }
    );
    await Promise.all(work);
    expect(frames).toEqual([
        {
            error: 'Could not refresh runtime status on this Computer.',
            requestId: 'req_status',
            status: 'failed',
            type: 'inventory-refresh-result',
        },
    ]);
});
