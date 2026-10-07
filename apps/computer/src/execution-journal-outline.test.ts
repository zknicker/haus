import { expect, test } from 'bun:test';
import {
    agentExecutionOutlineSchema,
    EXECUTION_OUTLINE_LABEL_MAX_CHARS,
    EXECUTION_OUTLINE_MAX_STEPS,
} from '@haus/api';
import { outlineExecutionJournal } from './execution-journal-outline.ts';
import type {
    ComputerExecutionJournalDocument,
    ComputerExecutionJournalTool,
} from './harness/execution-journal.ts';

const secretOutput = 'SECRET-OUTPUT-BODY';
const secretReport = 'SECRET-SUBAGENT-REPORT';
const secretReasoning = 'SECRET-REASONING-TEXT';

function tool(
    overrides: Partial<ComputerExecutionJournalTool> &
        Pick<ComputerExecutionJournalTool, 'toolCallId'>
): ComputerExecutionJournalTool {
    return {
        startedAt: '2026-10-01T10:00:01.000Z',
        status: 'completed',
        toolName: 'bash',
        ...overrides,
    };
}

const document: ComputerExecutionJournalDocument = {
    endedAt: '2026-10-01T10:00:20.000Z',
    reasoning: [
        {
            endedAt: '2026-10-01T10:00:01.000Z',
            id: 'think_1',
            startedAt: '2026-10-01T10:00:00.500Z',
            text: secretReasoning,
        },
    ],
    runId: 'run_outline',
    startedAt: '2026-10-01T10:00:00.000Z',
    status: 'completed',
    tools: [
        tool({
            endedAt: '2026-10-01T10:00:03.000Z',
            input: {
                command: 'curl -H "Authorization: Bearer sk-live-123" https://api.example.com/v1',
            },
            output: { stdout: secretOutput },
            toolCallId: 'call_shell',
        }),
        tool({
            endedAt: '2026-10-01T10:00:04.000Z',
            input: {
                command:
                    "haus message send --target dm:@zach <<'HAUSMSG'\nSECRET-MESSAGE-BODY\nHAUSMSG",
            },
            startedAt: '2026-10-01T10:00:03.500Z',
            toolCallId: 'call_haus',
        }),
        tool({
            endedAt: '2026-10-01T10:00:15.000Z',
            input: { description: 'Survey the repo', prompt: 'SECRET-PROMPT' },
            output: secretReport,
            startedAt: '2026-10-01T10:00:05.000Z',
            subagent: {
                label: 'Survey the repo',
                startedAt: '2026-10-01T10:00:05.000Z',
                status: 'completed',
            },
            toolCallId: 'call_agent',
            toolName: 'Agent',
        }),
        tool({
            error: 'not found',
            input: { file_path: '/Users/someone/haus/servers/srv_1/agents/agt_1/workspace/a.ts' },
            parentToolCallId: 'call_agent',
            startedAt: '2026-10-01T10:00:06.000Z',
            status: 'failed',
            toolCallId: 'call_child',
            toolName: 'Read',
        }),
        tool({
            input: { command: "cat > notes.md <<'EOF'\nSECRET-FILE-BODY\nEOF" },
            startedAt: '2026-10-01T10:00:16.000Z',
            status: 'running',
            toolCallId: 'call_open',
        }),
    ],
};

test('outlines steps by kind, tree, and timing without any free-text bodies', () => {
    const outline = outlineExecutionJournal(document);

    expect(agentExecutionOutlineSchema.parse(outline)).toEqual(outline);
    expect(outline).toMatchObject({
        durationMs: 20_000,
        runId: 'run_outline',
        status: 'completed',
    });
    expect(outline.steps.map((step) => [step.id, step.kind, step.depth])).toEqual([
        ['think_1', 'reasoning', 0],
        ['call_shell', 'tool', 0],
        ['call_haus', 'bookkeeping', 0],
        ['call_agent', 'subagent', 0],
        ['call_child', 'tool', 1],
        ['call_open', 'tool', 0],
    ]);
    const byId = new Map(outline.steps.map((step) => [step.id, step]));
    expect(byId.get('call_shell')).toMatchObject({ durationMs: 2000, startOffsetMs: 1000 });
    expect(byId.get('call_agent')).toMatchObject({
        subagent: { failedToolCount: 1, label: 'Survey the repo' },
    });
    expect(byId.get('call_child')).toMatchObject({ label: 'read a.ts', parentId: 'call_agent' });
    expect(byId.get('call_open')).toMatchObject({ label: 'cat > notes.md' });
    expect(byId.get('call_open')?.durationMs).toBeUndefined();
    expect(byId.get('call_haus')?.label).toBe('haus message send --target dm:@zach');

    const wire = JSON.stringify(outline);
    for (const secret of [
        secretOutput,
        secretReport,
        secretReasoning,
        'SECRET-PROMPT',
        'SECRET-MESSAGE-BODY',
        'SECRET-FILE-BODY',
        'sk-live-123',
    ]) {
        expect(wire).not.toContain(secret);
    }
    expect(wire).not.toContain('/Users/someone');
});

test('caps steps, keeping top-level steps first, and clips long labels', () => {
    const parent = tool({
        startedAt: '2026-10-01T10:00:00.000Z',
        subagent: {
            label: 'x'.repeat(128),
            startedAt: '2026-10-01T10:00:00.000Z',
            status: 'completed',
        },
        toolCallId: 'call_parent',
        toolName: 'Agent',
    });
    const children = Array.from({ length: EXECUTION_OUTLINE_MAX_STEPS }, (_, index) =>
        tool({
            parentToolCallId: 'call_parent',
            startedAt: '2026-10-01T10:00:01.000Z',
            toolCallId: `call_child_${index}`,
        })
    );
    const topLevel = Array.from({ length: 10 }, (_, index) =>
        tool({
            input: { command: `echo ${'y'.repeat(300)}` },
            startedAt: '2026-10-01T10:00:30.000Z',
            toolCallId: `call_top_${index}`,
        })
    );
    const outline = outlineExecutionJournal({
        runId: 'run_big',
        startedAt: '2026-10-01T10:00:00.000Z',
        status: 'running',
        tools: [parent, ...children, ...topLevel],
    });

    expect(agentExecutionOutlineSchema.safeParse(outline).success).toBe(true);
    expect(outline.steps).toHaveLength(EXECUTION_OUTLINE_MAX_STEPS);
    expect(outline.omittedSteps).toBe(11);
    expect(outline.steps.filter((step) => step.depth === 0)).toHaveLength(11);
    for (const step of outline.steps) {
        expect(step.label.length).toBeLessThanOrEqual(EXECUTION_OUTLINE_LABEL_MAX_CHARS);
    }
});
