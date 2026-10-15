/**
 * How one journal mutation changes a document. The Computer's live journal, its
 * local log replay, and the Server's replay of uploaded records share these
 * appliers, so every reader reproduces the document the turn held.
 */

import { EXECUTION_JOURNAL_REASONING_MAX_BLOCKS } from './agent-execution-journal.ts';
import type {
    ExecutionJournalDocument,
    ExecutionJournalInterruptReason,
    ExecutionJournalMutation,
    ExecutionJournalStatus,
    ExecutionJournalTool,
} from './agent-execution-journal-document.ts';

type Mutation<Type extends ExecutionJournalMutation['type']> = Extract<
    ExecutionJournalMutation,
    { type: Type }
>;

/** Applies one mutation in place and reports whether it changed the document. */
export function applyExecutionJournalMutation(
    document: ExecutionJournalDocument,
    record: ExecutionJournalMutation
): boolean {
    switch (record.type) {
        case 'tool-call':
            return applyToolCall(document, record);
        case 'tool-result':
            return applyToolResult(document, record);
        case 'subagent':
            return applySubagent(document, record);
        case 'reasoning-start':
            return applyReasoningStart(document, record);
        case 'reasoning-append':
            return applyReasoningAppend(document, record);
        case 'reasoning-end':
            return applyReasoningEnd(document, record);
        case 'interrupt':
            return applyInterrupt(document, record);
        default:
            return applyFinish(document, record);
    }
}

export function findExecutionJournalReasoning(document: ExecutionJournalDocument, id: string) {
    return document.reasoning?.find((candidate) => candidate.id === id);
}

export function interruptExecutionJournalTool(
    tool: ExecutionJournalTool,
    now: Date,
    reason: ExecutionJournalInterruptReason
) {
    tool.status = 'interrupted';
    tool.endedAt = now.toISOString();
    tool.durationMs = Math.max(0, now.getTime() - Date.parse(tool.startedAt));
    const interruptions = tool.interruptions ?? [];
    interruptions.push({ at: tool.endedAt, reason });
    tool.interruptions = interruptions;
}

/** Closes a sub-agent still running when its tool or turn settles without saying so. */
export function settleExecutionJournalSubagent(
    tool: ExecutionJournalTool,
    status: Exclude<ExecutionJournalStatus, 'running'>,
    at: string
) {
    if (tool.subagent?.status !== 'running') {
        return;
    }
    tool.subagent = { ...tool.subagent, endedAt: at, status };
}

function findTool(document: ExecutionJournalDocument, toolCallId: string) {
    return document.tools.find((candidate) => candidate.toolCallId === toolCallId);
}

function applyToolCall(document: ExecutionJournalDocument, record: Mutation<'tool-call'>): boolean {
    const existing = findTool(document, record.toolCallId);
    const tool =
        existing ?? openTool(document, record.toolCallId, record.toolName, record.occurredAt);
    if (existing?.status === 'interrupted') {
        tool.status = 'running';
        tool.endedAt = undefined;
        tool.durationMs = undefined;
        tool.final = undefined;
        tool.output = undefined;
        tool.error = undefined;
    }
    tool.toolName = record.toolName;
    tool.nativeName ??= record.nativeName;
    tool.parentToolCallId ??= record.parentToolCallId;
    if (record.input !== undefined) {
        tool.input = record.input;
    }
    return true;
}

function applyToolResult(
    document: ExecutionJournalDocument,
    record: Mutation<'tool-result'>
): boolean {
    const tool =
        findTool(document, record.toolCallId) ??
        openTool(document, record.toolCallId, record.toolName, record.occurredAt);
    if (tool.final) {
        return false;
    }
    tool.toolName = record.toolName;
    tool.nativeName ??= record.nativeName;
    const result = record.isError
        ? { error: record.output, observedAt: record.occurredAt }
        : { observedAt: record.occurredAt, output: record.output };
    if (record.preliminary) {
        tool.preliminary = result;
    } else {
        tool.final = result;
        tool.status = record.isError ? 'failed' : 'completed';
        tool.endedAt = record.occurredAt;
        tool.durationMs = Math.max(0, Date.parse(record.occurredAt) - Date.parse(tool.startedAt));
        settleExecutionJournalSubagent(tool, tool.status, record.occurredAt);
    }
    if (record.isError) {
        tool.error = record.output;
    } else {
        tool.output = record.output;
    }
    return true;
}

function applySubagent(document: ExecutionJournalDocument, record: Mutation<'subagent'>): boolean {
    const tool = findTool(document, record.toolCallId);
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

function applyReasoningStart(
    document: ExecutionJournalDocument,
    record: Mutation<'reasoning-start'>
): boolean {
    const blocks = document.reasoning ?? [];
    if (
        findExecutionJournalReasoning(document, record.id) ||
        blocks.length >= EXECUTION_JOURNAL_REASONING_MAX_BLOCKS
    ) {
        return false;
    }
    blocks.push({ id: record.id, startedAt: record.startedAt, text: '' });
    document.reasoning = blocks;
    return true;
}

function applyReasoningAppend(
    document: ExecutionJournalDocument,
    record: Mutation<'reasoning-append'>
): boolean {
    const block = findExecutionJournalReasoning(document, record.id);
    if (!block) {
        return false;
    }
    block.text += record.text;
    if (record.truncated) {
        block.truncated = true;
    }
    return true;
}

function applyReasoningEnd(
    document: ExecutionJournalDocument,
    record: Mutation<'reasoning-end'>
): boolean {
    const block = findExecutionJournalReasoning(document, record.id);
    if (!block) {
        return false;
    }
    block.endedAt = record.endedAt;
    return true;
}

function applyInterrupt(
    document: ExecutionJournalDocument,
    record: Mutation<'interrupt'>
): boolean {
    const at = new Date(record.at);
    let changed = false;
    for (const tool of document.tools) {
        if (tool.status !== 'running') {
            continue;
        }
        settleExecutionJournalSubagent(tool, 'interrupted', record.at);
        if (record.status === 'interrupted') {
            interruptExecutionJournalTool(tool, at, record.reason);
        } else {
            tool.status = 'failed';
            tool.endedAt = record.at;
            tool.durationMs = Math.max(0, at.getTime() - Date.parse(tool.startedAt));
            tool.error = record.error;
            tool.final = { error: record.error, observedAt: record.at };
        }
        changed = true;
    }
    return changed;
}

function applyFinish(document: ExecutionJournalDocument, record: Mutation<'finish'>): boolean {
    const at = Date.parse(record.at);
    for (const tool of document.tools) {
        settleExecutionJournalSubagent(tool, 'interrupted', record.at);
        if (tool.status !== 'running') {
            continue;
        }
        tool.status = record.status === 'completed' ? 'failed' : record.status;
        tool.endedAt = record.at;
        tool.durationMs = Math.max(0, at - Date.parse(tool.startedAt));
        if (record.status === 'completed') {
            tool.error = { code: 'missing_result' };
            tool.final = { error: tool.error, observedAt: record.at };
        } else {
            tool.error = record.error ?? { code: record.status };
        }
    }
    document.status = record.status;
    document.endedAt = record.at;
    document.error = record.error;
    return true;
}

function openTool(
    document: ExecutionJournalDocument,
    toolCallId: string,
    toolName: string,
    startedAt: string
): ExecutionJournalTool {
    const tool: ExecutionJournalTool = { startedAt, status: 'running', toolCallId, toolName };
    document.tools.push(tool);
    return tool;
}
