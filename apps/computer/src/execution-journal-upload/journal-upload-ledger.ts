/**
 * Which local journals the Server already holds. A run is synced once the
 * Server stored every record through its settling one; the uploader then writes
 * `<runId>.uploaded` beside the journal. A run without that mark is resent by
 * the next connect's resend pass (backfill).
 */
import type { Dirent } from 'node:fs';
import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isExecutionJournalRunId, journalDirectoryPath } from '../harness/execution-journal.ts';

const markerSuffix = '.uploaded';
const journalName = /^(.+)\.(json|ndjson)$/u;

export interface UnsyncedJournal {
    agentId: string;
    agentRoot: string;
    modifiedAt: number;
    runId: string;
}

/** Every unmarked journal under one Server partition changed since `since`, newest first. */
export async function listUnsyncedJournals(input: {
    serverRoot: string;
    since: number;
}): Promise<UnsyncedJournal[]> {
    const agentsDir = join(input.serverRoot, 'agents');
    const entries = await readdir(agentsDir, { withFileTypes: true }).catch(
        whenMissing<Dirent[]>([])
    );
    const found: UnsyncedJournal[] = [];
    // A stray file such as `.DS_Store` beside the Agent directories must not abort the pass.
    for (const agentId of entries.filter((entry) => entry.isDirectory()).map(nameOf)) {
        const agentRoot = join(agentsDir, agentId);
        const directory = journalDirectoryPath(agentRoot);
        const names = await readdir(directory).catch(whenMissing<string[]>([]));
        const marked = new Set(
            names
                .filter((name) => name.endsWith(markerSuffix))
                .map((name) => name.slice(0, -markerSuffix.length))
        );
        const files = new Map<string, string>();
        for (const name of names) {
            const runId = journalName.exec(name)?.[1];
            if (runId && isExecutionJournalRunId(runId) && !marked.has(runId)) {
                files.set(runId, name);
            }
        }
        for (const [runId, name] of files) {
            const modifiedAt = await stat(join(directory, name)).then(
                (stats) => stats.mtimeMs,
                whenMissing(0)
            );
            if (modifiedAt >= input.since) {
                found.push({ agentId, agentRoot, modifiedAt, runId });
            }
        }
    }
    return found.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

export async function markJournalSynced(
    agentRoot: string,
    runId: string,
    throughSequence: number
): Promise<void> {
    await writeFile(
        markerPath(agentRoot, runId),
        `${JSON.stringify({ syncedAt: new Date().toISOString(), throughSequence })}\n`,
        { mode: 0o600 }
    );
}

export async function clearJournalSynced(agentRoot: string, runId: string): Promise<void> {
    await rm(markerPath(agentRoot, runId), { force: true });
}

function nameOf(entry: Dirent): string {
    return entry.name;
}

function markerPath(agentRoot: string, runId: string): string {
    return join(journalDirectoryPath(agentRoot), `${runId}${markerSuffix}`);
}

/** A directory or file that does not exist reads as `fallback`; any other failure throws. */
export function whenMissing<T>(fallback: T) {
    return (error: unknown): T => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return fallback;
        }
        throw error;
    };
}
