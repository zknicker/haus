import { join } from 'node:path';
import { FileExecutionJournal } from './execution-journal-file';
import {
    readExecutionJournalLog,
    readExecutionJournalSnapshot,
    startExecutionJournalLog,
} from './execution-journal-store';
import { settleSubagent } from './execution-journal-subagent';
import { interruptTool, isJournalDocument } from './execution-journal-values';

export type {
    ComputerExecutionJournal,
    ComputerExecutionJournalDocument,
    ComputerExecutionJournalReasoning,
    ComputerExecutionJournalResult,
    ComputerExecutionJournalStatus,
    ComputerExecutionJournalSubagent,
    ComputerExecutionJournalSubagentPatch,
    ComputerExecutionJournalTool,
    JournalValue,
} from './execution-journal-types';

import type {
    ComputerExecutionJournal,
    ComputerExecutionJournalDocument,
} from './execution-journal-types';

const journalDirectory = 'execution-journal';
const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

export async function createComputerExecutionJournal(input: {
    /** Told after every write, so an open activity view re-reads instead of polling. */
    activity?: { journalChanged(): void };
    agentRoot: string;
    now?: () => Date;
    runId: string;
}): Promise<ComputerExecutionJournal> {
    const path = executionJournalPath(input.agentRoot, input.runId);
    const now = input.now ?? (() => new Date());
    const existing = await readComputerExecutionJournal(input.agentRoot, input.runId);
    const document: ComputerExecutionJournalDocument = existing ?? {
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
            settleSubagent(tool, 'interrupted', now().toISOString());
            interruptTool(tool, now(), 'computer_restart');
        }
        document.status = 'running';
        document.endedAt = undefined;
        document.error = undefined;
    }
    await startExecutionJournalLog(path, document);
    return new FileExecutionJournal(path, document, now, () => input.activity?.journalChanged());
}

/**
 * Prefers the settled snapshot; a turn that is still running — or one a crash
 * left open — is reconstructed by replaying its append-only log.
 */
export async function readComputerExecutionJournal(
    agentRoot: string,
    runId: string
): Promise<ComputerExecutionJournalDocument | null> {
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

function journalDirectoryPath(agentRoot: string) {
    return join(agentRoot, 'runtime', journalDirectory);
}
