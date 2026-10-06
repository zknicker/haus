import { expect, test } from 'bun:test';
import {
    type AgentExecutionJournal,
    agentExecutionJournalSchema,
} from './agent-execution-journal.ts';

const at = '2026-10-06T12:00:00.000Z';

test('a journal nests a sub-agent record on its delegating tool and its calls under it', () => {
    const journal: AgentExecutionJournal = {
        runId: 'run_one',
        startedAt: at,
        status: 'completed',
        tools: [
            {
                startedAt: at,
                status: 'completed',
                subagent: {
                    endedAt: at,
                    label: 'Count lines a',
                    latestAction: 'Reading a.txt',
                    startedAt: at,
                    status: 'completed',
                    subagentType: 'general-purpose',
                    usage: { durationMs: 8390, toolUses: 3, totalTokens: 24_660 },
                },
                toolCallId: 'toolu_parent',
                toolName: 'Agent',
            },
            {
                parentToolCallId: 'toolu_parent',
                startedAt: at,
                status: 'completed',
                toolCallId: 'toolu_child',
                toolName: 'Read',
            },
        ],
    };
    expect(agentExecutionJournalSchema.parse(journal)).toEqual(journal);
    const [parent] = journal.tools;
    const unknownStatus = {
        ...journal,
        tools: [{ ...parent, subagent: { ...parent?.subagent, status: 'killed' } }],
    };
    expect(agentExecutionJournalSchema.safeParse(unknownStatus).success).toBe(false);
    const longLabel = {
        ...journal,
        tools: [{ ...parent, subagent: { ...parent?.subagent, label: 'x'.repeat(129) } }],
    };
    expect(agentExecutionJournalSchema.safeParse(longLabel).success).toBe(false);
});
