/**
 * How a delegating tool call's sub-agent record changes. The parent tool owns
 * the record; its settlement, the turn's interruption, and the turn's finish
 * each close a sub-agent the runtime left running.
 */
import type { JournalMutationRecord } from './execution-journal-records';
import type {
    ComputerExecutionJournalDocument,
    ComputerExecutionJournalStatus,
    ComputerExecutionJournalTool,
} from './execution-journal-types';

export function applySubagent(
    document: ComputerExecutionJournalDocument,
    record: Extract<JournalMutationRecord, { type: 'subagent' }>
): boolean {
    const tool = document.tools.find((candidate) => candidate.toolCallId === record.toolCallId);
    // Only a started sub-agent (which always reports a status) opens the record.
    if (!tool || (tool.subagent === undefined && record.patch.status === undefined)) {
        return false;
    }
    const { endedAt, ...patch } = record.patch;
    const subagent = {
        label: '',
        startedAt: record.occurredAt,
        status: 'running' as const,
        ...tool.subagent,
        ...patch,
    };
    if (endedAt === null) {
        subagent.endedAt = undefined;
    } else if (endedAt !== undefined) {
        subagent.endedAt = endedAt;
    }
    tool.subagent = subagent;
    return true;
}

/** Closes a sub-agent still running when its tool or turn settles without saying so. */
export function settleSubagent(
    tool: ComputerExecutionJournalTool,
    status: Exclude<ComputerExecutionJournalStatus, 'running'>,
    at: string
) {
    if (tool.subagent?.status !== 'running') {
        return;
    }
    tool.subagent = { ...tool.subagent, endedAt: at, status };
}
