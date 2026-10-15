import type { AgentExecutionJournal } from './agent-execution-journal.ts';
import type {
    ExecutionJournalDocument,
    ExecutionJournalTool,
} from './agent-execution-journal-document.ts';
import { executionToolFailure, executionTurnFailure } from './agent-execution-journal-failure.ts';

/**
 * Shapes a replayed document for its reader: a readable `failure` beside each
 * raw error, and each sub-agent's failed-call count. Paths and secrets were
 * already presented on the Computer before the records left it.
 */
export function presentExecutionJournal(document: ExecutionJournalDocument): AgentExecutionJournal {
    const failedChildren = countFailedChildren(document.tools);
    const failure = document.status === 'failed' ? executionTurnFailure(document.error) : undefined;
    return {
        ...document,
        ...(failure ? { failure } : {}),
        tools: document.tools.map((tool) =>
            presentTool(tool, failedChildren.get(tool.toolCallId) ?? 0)
        ),
    };
}

function presentTool(
    tool: ExecutionJournalTool,
    failedToolCount: number
): AgentExecutionJournal['tools'][number] {
    const failure = tool.status === 'failed' ? executionToolFailure(tool.error) : undefined;
    return {
        ...tool,
        ...(failure ? { failure } : {}),
        ...(tool.subagent ? { subagent: { ...tool.subagent, failedToolCount } } : {}),
    };
}

function countFailedChildren(tools: readonly ExecutionJournalTool[]) {
    const counts = new Map<string, number>();
    for (const tool of tools) {
        if (tool.parentToolCallId && tool.status === 'failed') {
            counts.set(tool.parentToolCallId, (counts.get(tool.parentToolCallId) ?? 0) + 1);
        }
    }
    return counts;
}
