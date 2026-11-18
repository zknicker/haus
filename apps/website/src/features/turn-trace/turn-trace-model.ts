import type {
    AgentActivityEvent,
    AgentExecutionJournal,
    AgentExecutionJournalReasoning,
    AgentExecutionJournalTool,
} from '@haus/api';
import { classifyTraceTool, type TurnTraceTool } from './turn-trace-tool-model.ts';

export type TurnTraceEntry =
    | {
          readonly at: string;
          readonly event: AgentActivityEvent;
          readonly key: string;
          readonly kind: 'event';
      }
    | {
          readonly at: string;
          readonly isStreaming: boolean;
          readonly key: string;
          readonly kind: 'reasoning';
          readonly reasoning: AgentExecutionJournalReasoning;
      }
    | {
          readonly at: string;
          readonly key: string;
          readonly kind: 'tool';
          readonly tool: TurnTraceTool;
      };

interface OrderedEntry {
    readonly entry: TurnTraceEntry;
    readonly sequence: number;
    readonly time: number;
}

/**
 * One rich trace from the Computer's reasoning and tool evidence, plus the Server
 * history no journal holds: a message the Agent received mid-turn.
 */
export function buildTurnTrace(
    journal: AgentExecutionJournal | null,
    events: readonly AgentActivityEvent[] = []
): TurnTraceEntry[] {
    const reasoning = (journal?.reasoning ?? []).filter((block) => block.text.trim().length > 0);
    const ordered: OrderedEntry[] = [];

    for (const [index, block] of reasoning.entries()) {
        ordered.push({
            entry: {
                at: block.startedAt,
                isStreaming: !block.endedAt && journal?.status === 'running',
                key: `reasoning:${block.id}`,
                kind: 'reasoning',
                reasoning: block,
            },
            sequence: index,
            time: Date.parse(block.startedAt),
        });
    }

    for (const { index, tool } of nestTraceTools(journal?.tools ?? [])) {
        ordered.push({
            entry: {
                at: tool.source.startedAt,
                key: `tool:${tool.source.toolCallId}`,
                kind: 'tool',
                tool,
            },
            sequence: index,
            time: Date.parse(tool.source.startedAt),
        });
    }

    for (const event of events) {
        if (event.category !== 'received_message') {
            continue;
        }
        ordered.push({
            entry: { at: event.occurredAt, event, key: `event:${event.id}`, kind: 'event' },
            sequence: event.position,
            time: Date.parse(event.occurredAt),
        });
    }

    return ordered.sort(compareEntries).map((item) => item.entry);
}

/**
 * Top-level calls with each sub-agent's own calls nested under it, in start
 * order. A child whose parent is missing from the journal stays top-level, and
 * so does any call a malformed parent cycle would otherwise hide.
 */
function nestTraceTools(
    tools: readonly AgentExecutionJournalTool[]
): Array<{ index: number; tool: TurnTraceTool }> {
    const ids = new Set(tools.map((tool) => tool.toolCallId));
    const indexed = tools.map((tool, index) => ({ index, tool }));
    const childrenOf = new Map<string, typeof indexed>();
    for (const item of indexed) {
        const parent = item.tool.parentToolCallId;
        if (parent && parent !== item.tool.toolCallId && ids.has(parent)) {
            childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), item]);
        }
    }
    const visited = new Set<string>();
    const nest = (tool: AgentExecutionJournalTool): TurnTraceTool => {
        visited.add(tool.toolCallId);
        const children = (childrenOf.get(tool.toolCallId) ?? [])
            .filter((child) => !visited.has(child.tool.toolCallId))
            .sort(compareTools)
            .map((child) => nest(child.tool));
        return classifyTraceTool(tool, children);
    };
    const isRoot = (tool: AgentExecutionJournalTool) =>
        !(tool.parentToolCallId && ids.has(tool.parentToolCallId)) ||
        tool.parentToolCallId === tool.toolCallId;
    const roots = indexed
        .filter((item) => isRoot(item.tool))
        .map((item) => ({
            index: item.index,
            tool: nest(item.tool),
        }));
    for (const item of indexed) {
        if (!visited.has(item.tool.toolCallId)) {
            roots.push({ index: item.index, tool: nest(item.tool) });
        }
    }
    return roots;
}

function compareTools(
    left: { index: number; tool: AgentExecutionJournalTool },
    right: { index: number; tool: AgentExecutionJournalTool }
): number {
    const delta = Date.parse(left.tool.startedAt) - Date.parse(right.tool.startedAt);
    return delta === 0 || Number.isNaN(delta) ? left.index - right.index : delta;
}

function compareEntries(left: OrderedEntry, right: OrderedEntry): number {
    if (left.time !== right.time) {
        return left.time - right.time;
    }
    return left.sequence - right.sequence;
}
