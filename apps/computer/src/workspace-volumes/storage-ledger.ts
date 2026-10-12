import { execFile } from 'node:child_process';
import { lstat, mkdir, readdir, readFile, rename, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

export const GiB = 1024 ** 3;
export const workspaceDefaults = {
    capacityBytes: 10 * GiB,
    cacheBytes: 2 * GiB,
    reserveBytes: 10 * GiB,
};
export type WorkspaceOptions = typeof workspaceDefaults;
const ledgerSchema = z.object({
    budgetBytes: z.number().int().nonnegative(),
    allocations: z.record(z.string(), z.number().int().positive()),
});
const execute = promisify(execFile);

/** shlock checks owner liveness and acquires atomically across attachment daemons. */
export async function withStorageLock<T>(
    dataRoot: string,
    operation: () => Promise<T>
): Promise<T> {
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });
    const lock = join(dataRoot, 'workspace-storage.lock');
    const deadline = Date.now() + 30_000;
    for (;;) {
        try {
            await execute('/usr/bin/shlock', ['-p', String(process.pid), '-f', lock]);
            break;
        } catch (error) {
            if (Date.now() >= deadline) {
                throw new Error(
                    'Workspace storage is busy; retry after Computer maintenance completes.',
                    { cause: error }
                );
            }
            await Bun.sleep(50);
        }
    }
    try {
        return await operation();
    } finally {
        await rm(lock, { force: true });
    }
}

export async function reserveWorkspace(
    dataRoot: string,
    agentRoot: string,
    options: WorkspaceOptions
) {
    for (const value of Object.values(options)) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new Error('Workspace storage limits must be positive integer bytes.');
        }
    }
    const free = await availableBytes(dataRoot);
    const file = join(dataRoot, 'workspace-storage.json');
    const ledger = (await readJson(file, ledgerSchema)) ?? {
        allocations: {},
        budgetBytes: Math.max(0, free - options.cacheBytes - options.reserveBytes),
    };
    const capacity =
        options.capacityBytes + Math.max(64 * 1024 ** 2, Math.ceil(options.capacityBytes * 0.02));
    const existing = ledger.allocations[agentRoot];
    if (existing !== undefined && existing !== capacity) {
        throw new Error('Workspace capacity differs from its existing reservation.');
    }
    const allocations = { ...ledger.allocations, [agentRoot]: capacity };
    const reserved = Object.values(allocations).reduce((sum, value) => sum + value, 0);
    let outstanding = 0;
    for (const [root, maximum] of Object.entries(allocations)) {
        outstanding += Math.max(
            0,
            maximum - (await allocatedBytes(join(root, 'workspace.sparsebundle')))
        );
    }
    if (
        reserved > ledger.budgetBytes ||
        outstanding + options.cacheBytes + options.reserveBytes > free
    ) {
        throw new Error('Computer has insufficient reserved capacity for this workspace.');
    }
    await writeJson(file, { ...ledger, allocations });
}

export async function releaseWorkspace(dataRoot: string, agentRoot: string) {
    const file = join(dataRoot, 'workspace-storage.json');
    const ledger = await readJson(file, ledgerSchema);
    if (!ledger) {
        return;
    }
    delete ledger.allocations[agentRoot];
    await writeJson(file, ledger);
}

export async function writeJson(file: string, value: unknown) {
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    await rename(temporary, file);
}

export async function readJson<T>(file: string, schema: z.ZodType<T>): Promise<T | null> {
    try {
        return schema.parse(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    }
}

export function isMissing(error: unknown) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function availableBytes(root: string) {
    const info = await statfs(root);
    return info.bavail * info.bsize;
}

async function allocatedBytes(root: string): Promise<number> {
    const info = await lstat(root).catch((error: unknown) => {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    });
    if (!info) {
        return 0;
    }
    if (!info.isDirectory()) {
        return info.blocks * 512;
    }
    let bytes = info.blocks * 512;
    for (const entry of await readdir(root)) {
        bytes += await allocatedBytes(join(root, entry));
    }
    return bytes;
}
