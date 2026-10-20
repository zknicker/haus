import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Checkpoints and daily summaries older than this are deleted after a heartbeat settles. */
export const checkpointRetentionDays = 14;

const checkpointsDir = join('heartbeat', 'checkpoints');
const dailyDir = join('heartbeat', 'daily');
const dateName = /^(\d{4}-\d{2}-\d{2})(?:\.md)?$/;

/**
 * The newest checkpoint or daily summary, as a workspace-relative path, or null before the
 * first heartbeat. Newest is by modification time, then path.
 */
export async function latestCheckpoint(workspaceDir: string): Promise<string | null> {
    const found: Array<{ mtimeMs: number; path: string }> = [];
    for (const day of await listEntries(join(workspaceDir, checkpointsDir), 'directory')) {
        const files = await listEntries(join(workspaceDir, checkpointsDir, day), 'file');
        for (const file of files.filter((name) => name.endsWith('.md'))) {
            found.push(await withMtime(workspaceDir, join(checkpointsDir, day, file)));
        }
    }
    for (const file of await listEntries(join(workspaceDir, dailyDir), 'file')) {
        if (file.endsWith('.md')) {
            found.push(await withMtime(workspaceDir, join(dailyDir, file)));
        }
    }
    found.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
    return found[0]?.path ?? null;
}

/**
 * Deletes date directories under `heartbeat/checkpoints/` and files under `heartbeat/daily/`
 * dated more than {@link checkpointRetentionDays} days before `now`, by the date in their
 * name. Nothing else in the workspace is touched.
 */
export async function pruneCheckpoints(workspaceDir: string, now: Date): Promise<void> {
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    cutoff.setDate(cutoff.getDate() - checkpointRetentionDays);
    const oldest = localDate(cutoff);
    const stale = [
        ...(await listEntries(join(workspaceDir, checkpointsDir), 'directory')).map((name) =>
            join(workspaceDir, checkpointsDir, name)
        ),
        ...(await listEntries(join(workspaceDir, dailyDir), 'file')).map((name) =>
            join(workspaceDir, dailyDir, name)
        ),
    ].filter((path) => {
        const date = dateName.exec(path.slice(path.lastIndexOf('/') + 1))?.[1];
        return date !== undefined && date < oldest;
    });
    for (const path of stale) {
        await rm(path, { force: true, recursive: true });
    }
}

async function withMtime(workspaceDir: string, path: string) {
    const stats = await stat(join(workspaceDir, path));
    return { mtimeMs: stats.mtimeMs, path };
}

async function listEntries(dir: string, kind: 'directory' | 'file'): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries
            .filter((entry) => (kind === 'directory' ? entry.isDirectory() : entry.isFile()))
            .map((entry) => entry.name);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
            return [];
        }
        throw error;
    }
}

function localDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}
