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

export type DreamVerdict = 'already-checked' | 'baselined' | 'due' | 'not-due';

export interface DreamCheck {
    /** MEMORY.md's size in bytes; null when it does not exist. */
    memoryBytes: number | null;
    verdict: DreamVerdict;
}

/**
 * Tonight's one check for this Agent. It is due when its memory (MEMORY.md plus
 * every file under notes/) changed since its last dream, or MEMORY.md outgrew its
 * index, and it has not dreamed within the cooldown. The first look only records a
 * baseline, so an Agent's existing memory never earns a dream by itself. A
 * baselined or not-due verdict records `localDate` as checked; a due one is
 * recorded by `markDreamChecked` once the request is sent, so an unsent request is
 * retried. Any later check on a recorded date is `already-checked`.
 */
export async function checkDream(
    input: DreamLocation & { localDate: string; now: number }
): Promise<DreamCheck> {
    const stampPath = dreamStampPath(input.agentRoot);
    const [memoryBytes, stamp] = await Promise.all([
        fileBytes(join(input.workspaceDir, 'MEMORY.md')),
        readStamp(stampPath),
    ]);
    if (stamp?.checkedOn === input.localDate) {
        return { memoryBytes, verdict: 'already-checked' };
    }
    const overSize = memoryBytes !== null && memoryBytes > memorySizeLimitBytes;
    const checked = { checkedOn: input.localDate };
    if (stamp && stamp.dreamedAt !== null && input.now - stamp.dreamedAt < dreamCooldownMs) {
        await writeStamp(stampPath, { ...stamp, ...checked });
        return { memoryBytes, verdict: 'not-due' };
    }
    const fingerprint = await memoryFingerprint(input.workspaceDir);
    if (stamp === null) {
        await writeStamp(stampPath, {
            checkedOn: overSize ? null : input.localDate,
            dreamedAt: null,
            fingerprint,
        });
        return { memoryBytes, verdict: overSize ? 'due' : 'baselined' };
    }
    if (overSize || stamp.fingerprint !== fingerprint) {
        return { memoryBytes, verdict: 'due' };
    }
    await writeStamp(stampPath, { ...stamp, ...checked });
    return { memoryBytes, verdict: 'not-due' };
}

/** Records tonight's due check once its dream request was sent. */
export async function markDreamChecked(agentRoot: string, localDate: string): Promise<void> {
    const stampPath = dreamStampPath(agentRoot);
    const stamp = await readStamp(stampPath);
    if (stamp) {
        await writeStamp(stampPath, { ...stamp, checkedOn: localDate });
    }
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
        const stampPath = dreamStampPath(input.agentRoot);
        await writeStamp(stampPath, {
            checkedOn: (await readStamp(stampPath))?.checkedOn ?? null,
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
    /** The last Computer-local date whose nightly check is done. */
    checkedOn: string | null;
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
        return {
            checkedOn: typeof parsed.checkedOn === 'string' ? parsed.checkedOn : null,
            dreamedAt: Number.isFinite(at) ? at : null,
            fingerprint: parsed.fingerprint,
        };
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
        `${JSON.stringify({ checkedOn: stamp.checkedOn, dreamedAt, fingerprint: stamp.fingerprint })}\n`,
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
