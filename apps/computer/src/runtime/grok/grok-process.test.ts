import { expect, test } from 'bun:test';
import { isRunning, killQuietly, trackingRegistry } from '../testing/process-group-testing.ts';
import { spawnGrokProcess } from './grok-process.ts';

test('a Grok leader that exits on its own still takes its process group down', async () => {
    const registry = trackingRegistry();
    const child = spawnGrokProcess({
        args: [],
        command: ['/bin/sh', '-c', 'sleep 60 >/dev/null 2>&1 & echo "$!" >&2'],
        cwd: '/',
        env: { PATH: process.env.PATH ?? '' },
        processes: registry,
    });
    await child.exited;
    const grandchild = Number(child.stderrTail().trim());
    expect(grandchild).toBeGreaterThan(0);
    try {
        // Registered until the group is gone, so Computer shutdown can still reach it.
        await registry.emptied;
        expect(isRunning(grandchild)).toBe(false);
        await child.terminate();
    } finally {
        killQuietly(grandchild);
    }
});
