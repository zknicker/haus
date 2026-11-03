import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type AgentDreamFile,
    type AgentDreamRecord,
    dreamFileLimit,
    dreamFilePatchLimitBytes,
    dreamPatchLimitBytes,
} from '@haus/api';
import { Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { countOps, diffLines, formatHunks, splitLines } from './dream-diff.ts';
import type { DreamMemoryChange } from './heartbeat-note.ts';

/**
 * A memory file's digest, plus its text when it is small enough to hold; a binary
 * or large file keeps only the digest, which still shows that it changed.
 */
export type MemoryEntry =
    | { readonly digest: string; readonly kind: 'text'; readonly text: string }
    | { readonly digest: string; readonly kind: 'opaque'; readonly reason: 'binary' | 'too-large' };

export interface MemorySnapshot {
    readonly entries: ReadonlyMap<string, MemoryEntry>;
    /** Memory held more files than the cap, so none were read and nothing compares. */
    readonly truncated: boolean;
}

export interface SnapshotLimits {
    readonly fileCount: number;
    /** Text held across the whole snapshot; past it, files are only digested. */
    readonly textBytes: number;
}

const defaultLimits: SnapshotLimits = { fileCount: dreamFileLimit, textBytes: 8 * 1024 * 1024 };
/** Larger memory files are compared by size and mtime only, never read. */
const snapshotFileLimitBytes = 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });

/** `MEMORY.md` and every regular file under `notes/`, keyed by workspace-relative path. */
export async function snapshotMemory(
    workspaceDir: string,
    limits: SnapshotLimits = defaultLimits
): Promise<MemorySnapshot> {
    const paths: string[] = [];
    if ((await statOrNull(join(workspaceDir, 'MEMORY.md')))?.isFile()) {
        paths.push('MEMORY.md');
    }
    await collectNotes(workspaceDir, 'notes', paths);
    const entries = new Map<string, MemoryEntry>();
    // Comparing a window of the files could misreport the rest as deleted.
    if (paths.length > limits.fileCount) {
        return { entries, truncated: true };
    }
    let textBytes = 0;
    for (const path of paths) {
        const entry = await readEntry(join(workspaceDir, path), limits.textBytes - textBytes);
        if (entry) {
            entries.set(path, entry);
            textBytes += entry.kind === 'text' ? Buffer.byteLength(entry.text) : 0;
        }
    }
    return { entries, truncated: false };
}

/**
 * Per-file stats and one unified diff between two snapshots. A file's text leaves
 * the patch past {@link dreamFilePatchLimitBytes}, and once the patch would pass
 * {@link dreamPatchLimitBytes}; both keep their counts and say `too-large`. When
 * either snapshot is truncated nothing is compared.
 */
export function diffMemory(
    beforeSnapshot: MemorySnapshot,
    afterSnapshot: MemorySnapshot
): Pick<AgentDreamRecord, 'files' | 'patch' | 'truncated'> {
    if (beforeSnapshot.truncated || afterSnapshot.truncated) {
        return { files: [], patch: '', truncated: true };
    }
    const before = beforeSnapshot.entries;
    const after = afterSnapshot.entries;
    const files: AgentDreamFile[] = [];
    const sections: string[] = [];
    let patchBytes = 0;
    for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
        const old = before.get(path);
        const next = after.get(path);
        if (sameEntry(old, next)) {
            continue;
        }
        const diff = diffFile(path, old, next);
        const bytes = diff.section === null ? 0 : Buffer.byteLength(diff.section);
        const fits =
            bytes <= dreamFilePatchLimitBytes && patchBytes + bytes <= dreamPatchLimitBytes;
        if (diff.section !== null && fits) {
            sections.push(diff.section);
            patchBytes += bytes;
            files.push(diff.file);
        } else {
            files.push(diff.section === null ? diff.file : { ...diff.file, omitted: 'too-large' });
        }
    }
    return { files, patch: sections.join(''), truncated: false };
}

/** One changed file's stats and, when it has text hunks, its patch section. */
function diffFile(
    path: string,
    old: MemoryEntry | undefined,
    next: MemoryEntry | undefined
): { file: AgentDreamFile; section: string | null } {
    const change: AgentDreamFile['change'] = old ? (next ? 'modified' : 'deleted') : 'added';
    const opaque = next?.kind === 'opaque' ? next : old?.kind === 'opaque' ? old : null;
    if (opaque) {
        return {
            file: { added: 0, change, omitted: opaque.reason, path, removed: 0 },
            section: null,
        };
    }
    const oldLines = splitLines(old?.kind === 'text' ? old.text : '');
    const newLines = splitLines(next?.kind === 'text' ? next.text : '');
    const ops = diffLines(oldLines, newLines);
    const hunks = formatHunks(ops, oldLines, newLines);
    const file = { ...countOps(ops), change, path };
    if (hunks.length === 0) {
        return { file, section: null };
    }
    const header = [
        `diff --git a/${path} b/${path}`,
        change === 'added' ? '--- /dev/null' : `--- a/${path}`,
        change === 'deleted' ? '+++ /dev/null' : `+++ b/${path}`,
    ];
    return { file, section: `${[...header, ...hunks].join('\n')}\n` };
}

export interface DreamRecording {
    /**
     * Diffs memory against the start and reports it; never throws. Returns what changed,
     * or null when nothing did or the diff failed, for the main session's quiet-run note.
     */
    finish(): Promise<DreamMemoryChange | null>;
}

/** Line totals and which of MEMORY.md and `notes/` moved; null when no file changed. */
export function summarizeMemoryChange(files: readonly AgentDreamFile[]): DreamMemoryChange | null {
    if (files.length === 0) {
        return null;
    }
    return {
        added: files.reduce((sum, file) => sum + file.added, 0),
        memory: files.some((file) => file.path === 'MEMORY.md'),
        notes: files.some((file) => file.path.startsWith('notes/')),
        removed: files.reduce((sum, file) => sum + file.removed, 0),
    };
}

/**
 * Starts recording a dream run's memory changes: a snapshot now, and at `finish`
 * an `agent-dream-record` frame with the diff. Any other run returns null. A
 * failure is logged and never fails the turn; it only costs the record.
 */
export async function openDreamRecording(input: {
    command: { agentId: string; heartbeat?: { kind: 'daytime' | 'nightly' }; runId: string };
    runtime: DaemonRuntime;
    sendFrame(frame: AgentDreamRecord): void;
    startedAt: string;
    workspaceDir: string;
}): Promise<DreamRecording | null> {
    if (input.command.heartbeat?.kind !== 'nightly') {
        return null;
    }
    let before: MemorySnapshot;
    try {
        before = await snapshotMemory(input.workspaceDir);
    } catch (error) {
        await logRecordFailure(input.runtime, error);
        return null;
    }
    return {
        async finish() {
            try {
                const changes = diffMemory(before, await snapshotMemory(input.workspaceDir));
                input.sendFrame({
                    agentId: input.command.agentId,
                    ...changes,
                    finishedAt: new Date().toISOString(),
                    runId: input.command.runId,
                    startedAt: input.startedAt,
                    type: 'agent-dream-record',
                });
                return summarizeMemoryChange(changes.files);
            } catch (error) {
                await logRecordFailure(input.runtime, error);
                return null;
            }
        },
    };
}

/** Digests compare across kinds, so a file that only crossed the text budget is unchanged. */
function sameEntry(left: MemoryEntry | undefined, right: MemoryEntry | undefined): boolean {
    return left !== undefined && right !== undefined && left.digest === right.digest;
}

/** `textRoom` is what is left of the snapshot's text budget. */
async function readEntry(path: string, textRoom: number): Promise<MemoryEntry | null> {
    const stats = await statOrNull(path);
    if (!stats?.isFile()) {
        return null;
    }
    if (stats.size > snapshotFileLimitBytes) {
        return { digest: `${stats.size}:${stats.mtimeMs}`, kind: 'opaque', reason: 'too-large' };
    }
    const bytes = await readFile(path);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength > textRoom) {
        return { digest, kind: 'opaque', reason: 'too-large' };
    }
    try {
        const text = utf8.decode(bytes);
        if (!text.includes('\0')) {
            return { digest, kind: 'text', text };
        }
    } catch {
        // Not UTF-8: compared by digest only.
    }
    return { digest, kind: 'opaque', reason: 'binary' };
}

async function collectNotes(root: string, relative: string, paths: string[]): Promise<void> {
    const entries: Dirent[] = await readdir(join(root, relative), { withFileTypes: true }).catch(
        (error: unknown) => {
            if (isMissing(error)) {
                return [];
            }
            throw error;
        }
    );
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const path = `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
            await collectNotes(root, path, paths);
        } else if (entry.isFile()) {
            paths.push(path);
        }
    }
}

async function statOrNull(path: string) {
    return await lstat(path).catch((error: unknown) => {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    });
}

function isMissing(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return code === 'ENOENT' || code === 'ENOTDIR';
}

async function logRecordFailure(runtime: DaemonRuntime, error: unknown): Promise<void> {
    await runtime.runPromise(
        Effect.logWarning('Dream memory record was not sent.').pipe(
            Effect.annotateLogs({
                errorCode: (error as NodeJS.ErrnoException | null)?.code ?? 'unknown',
                event: 'memory-dream-record-failed',
            })
        )
    );
}
