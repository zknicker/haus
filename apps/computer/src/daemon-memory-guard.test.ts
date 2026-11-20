import { expect, test } from 'bun:test';
import {
    daemonMemoryExceededMessage,
    devDaemonMemoryLimitBytes,
    watchDaemonMemory,
} from './daemon-memory-guard.ts';

test('the guard reports the resident set once it passes the limit', async () => {
    const exceeded = Promise.withResolvers<number>();
    watchDaemonMemory({ intervalMs: 1, limitBytes: 1, onExceeded: exceeded.resolve });
    expect(await exceeded.promise).toBeGreaterThan(1);
});

test('the exit message names the Server, the usage, and the limit', () => {
    expect(daemonMemoryExceededMessage('dev', 3 * 1024 ** 3, devDaemonMemoryLimitBytes)).toBe(
        '/dev: the attachment daemon is using 3.0 GB of memory, over its 2.0 GB dev limit. Exiting so it cannot take the machine down; this is a memory leak to fix.'
    );
});
