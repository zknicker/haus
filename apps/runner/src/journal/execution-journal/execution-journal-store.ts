/**
 * Disk layout for one run's execution journal.
 *
 * A live turn owns `<runId>.ndjson`: an append-only log opened with the state
 * the turn resumed from, then one small record per mutation. Finishing writes
 * the consolidated `<runId>.json` atomically and drops the log, so a settled run
 * is a single snapshot and a crashed one is still fully replayable.
 */
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ExecutionJournalDocument, ExecutionJournalMutation } from '@haus/api';
import { replayJournalRecords, serializeJournalRecord } from './execution-journal-records.ts';
import { isMissingFile } from './execution-journal-values.ts';

const fileMode = 0o600;
const directoryMode = 0o700;

export function executionJournalLogPath(snapshotPath: string): string {
    return `${snapshotPath.replace(/\.json$/u, '')}.ndjson`;
}

/**
 * Starts the run's log from `document` and retires any snapshot it supersedes,
 * so a reader never has to choose between two live descriptions of one run.
 */
export async function startExecutionJournalLog(
    snapshotPath: string,
    document: ExecutionJournalDocument
): Promise<void> {
    await mkdir(dirname(snapshotPath), { mode: directoryMode, recursive: true });
    await writeFile(
        executionJournalLogPath(snapshotPath),
        `${serializeJournalRecord({ document, type: 'open' })}\n`,
        { encoding: 'utf8', mode: fileMode }
    );
    await rm(snapshotPath, { force: true });
}

export async function appendExecutionJournalRecords(
    snapshotPath: string,
    records: ExecutionJournalMutation[]
): Promise<void> {
    if (records.length === 0) {
        return;
    }
    const payload = records.map((record) => serializeJournalRecord(record)).join('\n');
    await appendFile(executionJournalLogPath(snapshotPath), `${payload}\n`, {
        encoding: 'utf8',
        mode: fileMode,
    });
}

export async function writeExecutionJournalSnapshot(
    snapshotPath: string,
    serialized: string
): Promise<void> {
    await mkdir(dirname(snapshotPath), { mode: directoryMode, recursive: true });
    const temporary = `${snapshotPath}.tmp`;
    await writeFile(temporary, serialized, { encoding: 'utf8', mode: fileMode });
    await rename(temporary, snapshotPath);
    await rm(executionJournalLogPath(snapshotPath), { force: true });
}

/** The settled snapshot, or `null` when the run has none yet. */
export async function readExecutionJournalSnapshot(snapshotPath: string): Promise<unknown | null> {
    const raw = await readOptionalFile(snapshotPath);
    if (raw === null) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** The document a running or crashed turn's log describes, or `null`. */
export async function readExecutionJournalLog(
    snapshotPath: string
): Promise<ExecutionJournalDocument | null> {
    const raw = await readOptionalFile(executionJournalLogPath(snapshotPath));
    return raw === null ? null : replayJournalRecords(raw.split('\n'));
}

async function readOptionalFile(path: string): Promise<string | null> {
    try {
        return await readFile(path, 'utf8');
    } catch (cause) {
        if (isMissingFile(cause)) {
            return null;
        }
        throw cause;
    }
}
