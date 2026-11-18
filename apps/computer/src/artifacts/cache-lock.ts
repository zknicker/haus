import fs from 'node:fs/promises';
import { join } from 'node:path';
import { withPidLock } from '../pid-lock.ts';

export async function withArtifactCacheLock<T>(
    root: string,
    operation: () => Promise<T>
): Promise<T> {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    return withPidLock(
        join(root, '.lock'),
        {
            busyMessage: 'Shared file cache is busy. Retry after the current download.',
            pollMs: 100,
            timeoutMs: 300_000,
        },
        operation
    );
}
