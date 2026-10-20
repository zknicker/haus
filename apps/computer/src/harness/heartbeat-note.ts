import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** What the Agent's heartbeats did since its last main-session turn. */
export interface QuietRunNote {
    count: number;
    latestCheckpoint: string | null;
    reported: number;
}

/** Counts one settled heartbeat; `latestCheckpoint` is workspace-relative, or null. */
export async function recordHeartbeatSettled(
    agentRoot: string,
    run: { latestCheckpoint: string | null; reported: boolean }
): Promise<void> {
    const previous = await readQuietRunNote(agentRoot);
    const next: QuietRunNote = {
        count: (previous?.count ?? 0) + 1,
        latestCheckpoint: run.latestCheckpoint ?? previous?.latestCheckpoint ?? null,
        reported: (previous?.reported ?? 0) + (run.reported ? 1 : 0),
    };
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
        ? `latest checkpoint: ${note.latestCheckpoint}`
        : 'no checkpoint written';
    return `Your heartbeat ran ${note.count}× since your last turn (${note.reported} reported); ${checkpoint}.`;
}

function notePath(agentRoot: string): string {
    return join(agentRoot, 'runtime', 'heartbeat-note.json');
}
