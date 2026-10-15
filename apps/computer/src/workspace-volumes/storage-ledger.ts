import { lstat, mkdir, readdir, readFile, rename, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { withPidLock } from '../pid-lock.ts';

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

/** Serializes ledger reservations across attachment daemons sharing one data root. */
export async function withStorageLock<T>(
    dataRoot: string,
    operation: () => Promise<T>
): Promise<T> {
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });
    return withPidLock(
        join(dataRoot, 'workspace-storage.lock'),
        {
            busyMessage: 'Workspace storage is busy; retry after Computer maintenance completes.',
            pollMs: 50,
            timeoutMs: 30_000,
        },
        operation
    );
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

/** Drops reservations whose Agent partition no longer holds a volume; returns their roots. */
export async function releaseOrphanedWorkspaces(
    dataRoot: string,
    holdsVolume: (agentRoot: string) => Promise<boolean>
): Promise<string[]> {
    const file = join(dataRoot, 'workspace-storage.json');
    const ledger = await readJson(file, ledgerSchema);
    if (!ledger) {
        return [];
    }
    const orphaned: string[] = [];
    for (const agentRoot of Object.keys(ledger.allocations)) {
        if (!(await holdsVolume(agentRoot))) {
            orphaned.push(agentRoot);
        }
    }
    if (orphaned.length > 0) {
        const allocations = Object.fromEntries(
            Object.entries(ledger.allocations).filter(([root]) => !orphaned.includes(root))
        );
        await writeJson(file, { ...ledger, allocations });
    }
    return orphaned;
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
