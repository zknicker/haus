import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';

/** Raft v1.21's MEMORY.md target (4,000 tokens × 4 bytes), fixed: Haus exposes no setting for it. */
export const memorySizeLimitBytes = 16 * 1024;
/** A dream is due at most once per this span, so one quiet window yields one pass. */
export const dreamCooldownMs = 20 * 60 * 60 * 1000;

interface DreamLocation {
    agentRoot: string;
    workspaceDir: string;
}

/**
 * Whether this Agent should dream tonight: its memory (MEMORY.md plus every file
 * under notes/) changed since its last dream, or MEMORY.md outgrew its index, and it
 * has not dreamed within the cooldown. The first look only records a baseline, so an
 * Agent's existing memory never earns a dream by itself.
 */
export async function isDreamDue(input: DreamLocation & { now: number }): Promise<boolean> {
    const stampPath = dreamStampPath(input.agentRoot);
    const [bytes, stamp] = await Promise.all([
        fileBytes(join(input.workspaceDir, 'MEMORY.md')),
        readStamp(stampPath),
    ]);
    const overSize = bytes !== null && bytes > memorySizeLimitBytes;
    const dreamedAt = stamp?.dreamedAt ?? null;
    if (dreamedAt !== null && input.now - dreamedAt < dreamCooldownMs) {
        return false;
    }
    const fingerprint = await memoryFingerprint(input.workspaceDir);
    if (stamp === null) {
        await writeStamp(stampPath, { dreamedAt: null, fingerprint });
        return overSize;
    }
    return overSize || stamp.fingerprint !== fingerprint;
}

/**
 * Re-records the baseline when a dream turn completes, so the Agent's own dreaming
 * edits never make the next night's dream due. Every other turn is a no-op. A
 * failure is logged and never fails the completed turn; the next night retries.
 */
export async function settleDreamBaseline(
    input: DreamLocation & { dream?: unknown; now?: number; runtime: DaemonRuntime }
): Promise<void> {
    if (!input.dream) {
        return;
    }
    try {
        await writeStamp(dreamStampPath(input.agentRoot), {
            dreamedAt: input.now ?? Date.now(),
            fingerprint: await memoryFingerprint(input.workspaceDir),
        });
    } catch (error) {
        await input.runtime.runPromise(
            Effect.logWarning('Dream baseline was not recorded.').pipe(
                Effect.annotateLogs({
                    errorCode: (error as NodeJS.ErrnoException | null)?.code ?? 'unknown',
                    event: 'memory-dream-baseline-failed',
                })
            )
        );
    }
}

interface DreamStamp {
    dreamedAt: number | null;
    fingerprint: string;
}

function dreamStampPath(agentRoot: string): string {
    return join(agentRoot, 'runtime', 'memory-dream.json');
}

/** Path, size, and mtime of MEMORY.md and every file under notes/; stats only, no content reads. */
async function memoryFingerprint(workspaceDir: string): Promise<string> {
    const lines: string[] = [];
    const memory = await statOrNull(join(workspaceDir, 'MEMORY.md'));
    if (memory) {
        lines.push(`MEMORY.md\0${memory.size}\0${memory.mtimeMs}`);
    }
    await collectNotes(join(workspaceDir, 'notes'), 'notes', lines);
    return createHash('sha256').update(lines.join('\n')).digest('hex');
}

async function collectNotes(dir: string, relative: string, lines: string[]): Promise<void> {
    const entries: Dirent[] | null = await readdir(dir, { withFileTypes: true }).catch(
        (error: unknown) => {
            if (isMissing(error)) {
                return null;
            }
            throw error;
        }
    );
    for (const entry of (entries ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(dir, entry.name);
        const name = `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
            await collectNotes(path, name, lines);
            continue;
        }
        const stats = await statOrNull(path);
        if (stats) {
            lines.push(`${name}\0${stats.size}\0${stats.mtimeMs}`);
        }
    }
}

async function fileBytes(path: string): Promise<number | null> {
    const stats = await statOrNull(path);
    return stats?.isFile() ? stats.size : null;
}

async function statOrNull(path: string) {
    return await lstat(path).catch((error: unknown) => {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    });
}

async function readStamp(path: string): Promise<DreamStamp | null> {
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
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.fingerprint !== 'string') {
            return null;
        }
        const at = typeof parsed.dreamedAt === 'string' ? Date.parse(parsed.dreamedAt) : Number.NaN;
        return { dreamedAt: Number.isFinite(at) ? at : null, fingerprint: parsed.fingerprint };
    } catch {
        // A torn or foreign stamp only costs a fresh baseline.
        return null;
    }
}

async function writeStamp(path: string, stamp: DreamStamp): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    const dreamedAt = stamp.dreamedAt === null ? null : new Date(stamp.dreamedAt).toISOString();
    await writeFile(
        temporary,
        `${JSON.stringify({ dreamedAt, fingerprint: stamp.fingerprint })}\n`,
        { mode: 0o600 }
    );
    await rename(temporary, path);
}

function isMissing(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    );
}
