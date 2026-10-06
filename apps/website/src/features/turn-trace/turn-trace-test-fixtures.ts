/**
 * Journals trimmed from real turns on the 2026-10-06 Activity review stack
 * (`cnreview`). Inputs and timings are verbatim; long outputs are cut. Test
 * support only.
 */
import type {
    AgentExecutionJournal,
    AgentExecutionJournalReasoning,
    AgentExecutionJournalTool,
} from '@haus/api';

const day = '2026-10-06T17:';
export const host =
    '/Users/zknicker/.haus/dev/cnreview/computer/servers/srv_WaQNQzGWyLYyqZDE/agents/agt_5Pu8v37EEX9Jrmsa/workspace';

/** `mm:ss.mmm` past 17:00 UTC on the review day. */
export function t(clock: string): string {
    return `${day}${clock}Z`;
}

export function call(
    toolCallId: string,
    toolName: string,
    [start, end]: readonly [string, string?],
    input: unknown,
    extra: Partial<AgentExecutionJournalTool> = {}
): AgentExecutionJournalTool {
    return {
        input,
        startedAt: t(start),
        status: 'completed',
        toolCallId,
        toolName,
        ...(end ? { endedAt: t(end) } : {}),
        ...extra,
    };
}

export function think(
    id: string,
    start: string,
    end: string,
    text: string
): AgentExecutionJournalReasoning {
    return { endedAt: t(end), id, startedAt: t(start), text };
}

export function journal(
    runId: string,
    [start, end]: readonly [string, string?],
    tools: AgentExecutionJournalTool[],
    extra: Partial<AgentExecutionJournal> = {}
): AgentExecutionJournal {
    return {
        runId,
        startedAt: t(start),
        status: 'completed',
        tools,
        ...(end ? { endedAt: t(end) } : {}),
        ...extra,
    };
}
