import type {
    AgentActivityEvent,
    AgentExecutionJournal,
    AgentExecutionJournalReasoning,
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

    for (const [index, tool] of (journal?.tools ?? []).entries()) {
        ordered.push({
            entry: {
                at: tool.startedAt,
                key: `tool:${tool.toolCallId}`,
                kind: 'tool',
                tool: classifyTraceTool(tool),
            },
            sequence: index,
            time: Date.parse(tool.startedAt),
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

function compareEntries(left: OrderedEntry, right: OrderedEntry): number {
    if (left.time !== right.time) {
        return left.time - right.time;
    }
    return left.sequence - right.sequence;
}
