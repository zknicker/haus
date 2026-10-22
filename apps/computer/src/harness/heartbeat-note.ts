import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The settled runs remembered so a replayed run is not counted twice. */
const settledRunLimit = 50;

/** What a nightly dream changed in memory: line totals, and whether MEMORY.md or `notes/` moved. */
export interface DreamMemoryChange {
    added: number;
    memory: boolean;
    notes: boolean;
    removed: number;
}

/** What the Agent's heartbeats did since its last main-session turn. */
export interface QuietRunNote {
    count: number;
    /** Memory changes of the nightly runs among them, summed; null when none changed memory. */
    dream: DreamMemoryChange | null;
    latestCheckpoint: string | null;
    reported: number;
}

/**
 * Counts one settled heartbeat; `latestCheckpoint` is workspace-relative, or null, and
 * `dream` is what a nightly run changed in memory. A `runId` already settled is ignored,
 * so a replayed run never double-counts.
 */
export async function recordHeartbeatSettled(
    agentRoot: string,
    run: {
        dream?: DreamMemoryChange | null;
        latestCheckpoint: string | null;
        reported: boolean;
        runId?: string;
    }
): Promise<void> {
    const previous = await readQuietRunNote(agentRoot);
    const seen = await readSettledRunIds(agentRoot);
    if (run.runId && seen.includes(run.runId)) {
        return;
    }
    const next: QuietRunNote = {
        count: (previous?.count ?? 0) + 1,
        dream: mergeDreamChange(previous?.dream ?? null, run.dream ?? null),
        latestCheckpoint: run.latestCheckpoint ?? previous?.latestCheckpoint ?? null,
        reported: (previous?.reported ?? 0) + (run.reported ? 1 : 0),
    };
    if (run.runId) {
        await writeSettledRunIds(agentRoot, [...seen, run.runId].slice(-settledRunLimit));
    }
    const path = notePath(agentRoot);
    await mkdir(join(agentRoot, 'runtime'), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 });
    await rename(temporary, path);
}

/** Null when no heartbeat settled since the last main-session turn, or the file is unreadable. */
export async function readQuietRunNote(agentRoot: string): Promise<QuietRunNote | null> {
    const raw = await readFile(notePath(agentRoot), 'utf8').catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    });
    if (raw === null) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (
            typeof parsed.count !== 'number' ||
            !Number.isInteger(parsed.count) ||
            parsed.count < 1 ||
            typeof parsed.reported !== 'number' ||
            !Number.isInteger(parsed.reported) ||
            parsed.reported < 0
        ) {
            return null;
        }
        return {
            count: parsed.count,
            dream: parseDreamChange(parsed.dream),
            latestCheckpoint:
                typeof parsed.latestCheckpoint === 'string' ? parsed.latestCheckpoint : null,
            reported: parsed.reported,
        };
    } catch {
        // A torn note only costs one line.
        return null;
    }
}

export async function clearQuietRunNote(agentRoot: string): Promise<void> {
    await rm(notePath(agentRoot), { force: true });
}

/** The one line a main-session turn starts with, so the Agent can say what it has been doing. */
export function quietRunLine(note: QuietRunNote): string {
    const checkpoint = note.latestCheckpoint
        ? `Latest checkpoint: ${note.latestCheckpoint}.`
        : 'No checkpoint written.';
    return [
        `Your heartbeat ran ${note.count}× since your last turn (${note.reported} reported).`,
        note.dream ? dreamSentence(note.dream) : null,
        checkpoint,
    ]
        .filter((part) => part !== null)
        .join(' ');
}

function dreamSentence(dream: DreamMemoryChange): string {
    const files =
        dream.memory && dream.notes
            ? 'MEMORY.md and notes/'
            : dream.memory
              ? 'MEMORY.md'
              : 'notes/';
    const them = dream.memory && !dream.notes ? 'it' : 'them';
    return `Last night's dream updated ${files} (+${dream.added} −${dream.removed}): re-read ${them} before relying on memory.`;
}

function mergeDreamChange(
    previous: DreamMemoryChange | null,
    next: DreamMemoryChange | null
): DreamMemoryChange | null {
    if (!(previous && next)) {
        return previous ?? next;
    }
    return {
        added: previous.added + next.added,
        memory: previous.memory || next.memory,
        notes: previous.notes || next.notes,
        removed: previous.removed + next.removed,
    };
}

function parseDreamChange(value: unknown): DreamMemoryChange | null {
    const dream = value as Partial<Record<keyof DreamMemoryChange, unknown>> | null | undefined;
    if (
        dream &&
        Number.isInteger(dream.added) &&
        Number.isInteger(dream.removed) &&
        typeof dream.memory === 'boolean' &&
        typeof dream.notes === 'boolean'
    ) {
        return dream as DreamMemoryChange;
    }
    return null;
}

function notePath(agentRoot: string): string {
    return join(agentRoot, 'runtime', 'heartbeat-note.json');
}

/** Kept apart from the note, which the next main-session turn clears. */
function settledPath(agentRoot: string): string {
    return join(agentRoot, 'runtime', 'heartbeat-settled.json');
}

async function readSettledRunIds(agentRoot: string): Promise<string[]> {
    try {
        const parsed: unknown = JSON.parse(await readFile(settledPath(agentRoot), 'utf8'));
        return Array.isArray(parsed)
            ? parsed.filter((id): id is string => typeof id === 'string')
            : [];
    } catch {
        // Missing or torn: at worst one replay is counted again.
        return [];
    }
}

async function writeSettledRunIds(agentRoot: string, ids: string[]): Promise<void> {
    await mkdir(join(agentRoot, 'runtime'), { recursive: true });
    const temporary = `${settledPath(agentRoot)}.tmp`;
    await writeFile(temporary, `${JSON.stringify(ids)}\n`, { mode: 0o600 });
    await rename(temporary, settledPath(agentRoot));
}
