import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Raft's Cleaner default (65,536 bytes), fixed: Haus exposes no setting for it. */
export const memorySizeLimitBytes = 64 * 1024;
/** One notice per window per Agent, and only while MEMORY.md is still over. */
export const memoryNoticeWindowMs = 24 * 60 * 60 * 1000;

/**
 * A private, one-turn nudge when the Agent's MEMORY.md outgrows an index —
 * Raft's Cleaner item, carried in the turn input the Computer already composes
 * instead of an inbox row, so it never wakes a turn, never touches a Chat, and
 * never enters the Server's delivery or cause-inference ledger. The stamp is
 * taken at composition; a failed turn simply waits out the window.
 */
export async function takeMemorySizeNotice(input: {
    agentRoot: string;
    now?: number;
    workspaceDir: string;
}): Promise<string | null> {
    const bytes = await memoryFileBytes(join(input.workspaceDir, 'MEMORY.md'));
    if (bytes === null || bytes <= memorySizeLimitBytes) {
        return null;
    }
    const now = input.now ?? Date.now();
    const stampPath = join(input.agentRoot, 'runtime', 'memory-size-notice.json');
    const lastNoticedAt = await readNoticedAt(stampPath);
    if (lastNoticedAt !== null && now - lastNoticedAt < memoryNoticeWindowMs) {
        return null;
    }
    await writeNoticedAt(stampPath, now);
    return `[Haus workspace notice: MEMORY.md is ${formatKib(bytes)}, over ${formatKib(memorySizeLimitBytes)}.] You read it on every recovery; keep it an index and move details into notes/. Not a request from anyone; tidy it when convenient and do not mention it in chat.`;
}

async function memoryFileBytes(path: string): Promise<number | null> {
    const stats = await lstat(path).catch((error: unknown) => {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    });
    return stats?.isFile() ? stats.size : null;
}

async function readNoticedAt(path: string): Promise<number | null> {
    const raw = await readFile(path, 'utf8').catch((error: unknown) => {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    });
    if (raw === null) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as { noticedAt?: unknown };
        const at = typeof parsed.noticedAt === 'string' ? Date.parse(parsed.noticedAt) : Number.NaN;
        return Number.isFinite(at) ? at : null;
    } catch {
        // A torn or foreign stamp only costs one early notice.
        return null;
    }
}

async function writeNoticedAt(path: string, now: number): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ noticedAt: new Date(now).toISOString() })}\n`, {
        mode: 0o600,
    });
    await rename(temporary, path);
}

function formatKib(bytes: number): string {
    return `${(bytes / 1024).toFixed(1)} KiB`;
}

function isMissing(error: unknown): boolean {
    return (
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
    );
}
