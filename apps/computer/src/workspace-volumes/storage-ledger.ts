import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { withPidLock } from '../pid-lock.ts';

const ledgerSchema = z.object({
    budgetBytes: z.number().int().nonnegative(),
    allocations: z.record(z.string(), z.number().int().positive()),
});

/** Serializes workspace conversion and legacy-ledger cleanup across attachment daemons. */
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
