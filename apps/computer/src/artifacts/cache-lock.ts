import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function withArtifactCacheLock<T>(
    root: string,
    operation: () => Promise<T>
): Promise<T> {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const lock = join(root, '.lock');
    const deadline = Date.now() + 300_000;
    for (;;) {
        try {
            await execute('/usr/bin/shlock', ['-p', String(process.pid), '-f', lock]);
            break;
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                throw error;
            }
            if (Date.now() >= deadline) {
                throw new Error('Shared artifact cache is busy. Retry after the current download.');
            }
            await setTimeout(100);
        }
    }
    try {
        return await operation();
    } finally {
        await fs.rm(lock, { force: true });
    }
}

export function processExists(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error instanceof Error && 'code' in error && error.code !== 'ESRCH';
    }
}
