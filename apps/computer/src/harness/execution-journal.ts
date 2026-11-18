import { join } from 'node:path';
import {
    type ExecutionJournalDocument,
    interruptExecutionJournalTool,
    settleExecutionJournalSubagent,
} from '@haus/api';
import { FileExecutionJournal } from './execution-journal-file.ts';
import {
    readExecutionJournalLog,
    readExecutionJournalSnapshot,
    startExecutionJournalLog,
} from './execution-journal-store.ts';
import type { ComputerExecutionJournal, ExecutionJournalSink } from './execution-journal-types.ts';
import { isJournalDocument } from './execution-journal-values.ts';

export type { ComputerExecutionJournal, ExecutionJournalSink } from './execution-journal-types.ts';

const journalDirectory = 'execution-journal';
const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

/** `upload` hears every durable write, starting with the log's `open` record. */
export async function createComputerExecutionJournal(
    input: { agentRoot: string; now?: () => Date; runId: string },
    upload?: ExecutionJournalSink
): Promise<ComputerExecutionJournal> {
    const path = executionJournalPath(input.agentRoot, input.runId);
    const now = input.now ?? (() => new Date());
    const existing = await readComputerExecutionJournal(input.agentRoot, input.runId);
    const document: ExecutionJournalDocument = existing ?? {
        runId: input.runId,
        startedAt: now().toISOString(),
        status: 'running',
        tools: [],
    };
    if (existing) {
        for (const tool of document.tools) {
            if (tool.status !== 'running') {
                continue;
            }
            settleExecutionJournalSubagent(tool, 'interrupted', now().toISOString());
            interruptExecutionJournalTool(tool, now(), 'computer_restart');
        }
        document.status = 'running';
        document.endedAt = undefined;
        document.error = undefined;
    }
    await startExecutionJournalLog(path, document);
    upload?.written([{ document, type: 'open' }], document);
    return new FileExecutionJournal(path, document, now, upload);
}

/**
 * Prefers the settled snapshot; a turn that is still running — or one a crash
 * left open — is reconstructed by replaying its append-only log.
 */
export async function readComputerExecutionJournal(
    agentRoot: string,
    runId: string
): Promise<ExecutionJournalDocument | null> {
    const path = executionJournalPath(agentRoot, runId);
    const value =
        (await readExecutionJournalSnapshot(path)) ?? (await readExecutionJournalLog(path));
    return value !== null && isJournalDocument(value, runId) ? value : null;
}

export function executionJournalPath(agentRoot: string, runId: string): string {
    if (!isExecutionJournalRunId(runId)) {
        throw new Error('The execution journal run id is invalid.');
    }
    return join(journalDirectoryPath(agentRoot), `${runId}.json`);
}

export function isExecutionJournalRunId(runId: string): boolean {
    return runIdPattern.test(runId);
}

export function journalDirectoryPath(agentRoot: string) {
    return join(agentRoot, 'runtime', journalDirectory);
}
