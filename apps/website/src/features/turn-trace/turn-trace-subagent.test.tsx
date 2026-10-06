import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournal, AgentExecutionJournalTool } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTracePresentation } from './turn-trace.tsx';
import { buildTurnTrace } from './turn-trace-model.ts';
import {
    formatSubagentDetails,
    formatSubagentLabel,
    formatSubagentToolCount,
} from './turn-trace-subagent.ts';
import type { TurnTraceTool } from './turn-trace-tool-model.ts';

test('a sub-agent call nests its own calls in start order under one top-level row', () => {
    const entries = buildTurnTrace(
        journal([
            tool({ startedAt: at(1), subagent: subagent(), toolCallId: 'task', toolName: 'Agent' }),
            tool({
                parentToolCallId: 'task',
                startedAt: at(4),
                toolCallId: 'grep',
                toolName: 'Grep',
            }),
            tool({ startedAt: at(3), toolCallId: 'main-bash', toolName: 'Bash' }),
            tool({
                parentToolCallId: 'task',
                startedAt: at(2),
                toolCallId: 'read',
                toolName: 'Read',
            }),
        ])
    );

    assert.deepEqual(
        entries.map((entry) => entry.key),
        ['tool:task', 'tool:main-bash']
    );
    const parent = toolAt(entries, 0);
    assert.equal(parent.kind, 'subagent');
    assert.deepEqual(
        parent.children.map((child) => [child.source.toolCallId, child.kind]),
        [
            ['read', 'file-read'],
            ['grep', 'search'],
        ]
    );
    assert.deepEqual(toolAt(entries, 1).children, []);
});

test('a child whose parent is missing, or caught in a parent cycle, stays top-level once', () => {
    const entries = buildTurnTrace(
        journal([
            tool({
                parentToolCallId: 'gone',
                startedAt: at(1),
                toolCallId: 'orphan',
                toolName: 'Read',
            }),
            tool({ parentToolCallId: 'b', startedAt: at(2), toolCallId: 'a', toolName: 'Bash' }),
            tool({ parentToolCallId: 'a', startedAt: at(3), toolCallId: 'b', toolName: 'Bash' }),
        ])
    );
    const keys = entries.map((entry) => entry.key);
    assert.equal(keys[0], 'tool:orphan');
    assert.equal(toolAt(entries, 0).kind, 'file-read');
    const nestedIds = entries.flatMap((entry) =>
        entry.kind === 'tool'
            ? [entry.tool.source.toolCallId, ...entry.tool.children.map((c) => c.source.toolCallId)]
            : []
    );
    assert.deepEqual([...nestedIds].sort(), ['a', 'b', 'orphan']);
});

test('the row label follows the sub-agent status, not the parent call status', () => {
    const label = (status: 'completed' | 'failed' | 'interrupted' | 'running') =>
        formatSubagentLabel(tool({ status: 'completed', subagent: subagent({ status }) }));
    assert.equal(label('running'), 'Running sub-agent: Count files in apps');
    assert.equal(label('completed'), 'Ran sub-agent: Count files in apps');
    assert.equal(label('failed'), 'Sub-agent failed: Count files in apps');
    assert.equal(label('interrupted'), 'Sub-agent interrupted: Count files in apps');
    assert.equal(
        formatSubagentLabel(tool({ input: { description: 'Audit docs' }, toolName: 'Agent' })),
        'Ran sub-agent: Audit docs'
    );
});

test('sub-agent meta prefers reported usage, else counts the calls seen so far', () => {
    const settled = tool({
        subagent: subagent({ usage: { durationMs: 41_000, toolUses: 12, totalTokens: 34_200 } }),
    });
    assert.equal(formatSubagentToolCount(settled, 3), '12 tools');
    const timing = { durationMs: 41_000, isRunning: false, offsetMs: 0 };
    // The default type is noise; a specific one says what ran.
    assert.equal(formatSubagentDetails(settled, timing), '34.2K tokens · 41s');
    const explorer = tool({
        subagent: subagent({
            subagentType: 'Explore',
            usage: { durationMs: 1, totalTokens: 900, toolUses: 1 },
        }),
    });
    assert.equal(formatSubagentDetails(explorer, timing), 'Explore · 900 tokens · 41s');
    const live: AgentExecutionJournalTool = {
        startedAt: at(1),
        status: 'running',
        subagent: { label: 'Count files in apps', startedAt: at(1), status: 'running' },
        toolCallId: 'task',
        toolName: 'Agent',
    };
    assert.equal(formatSubagentToolCount(live, 1), '1 tool');
});

test('a failed sub-agent opens on its own and shows its calls and type', () => {
    const markup = renderToStaticMarkup(
        <TurnTracePresentation
            access="journal"
            isPending={false}
            presentation={{
                journal: journal([
                    tool({
                        status: 'failed',
                        subagent: subagent({ status: 'failed', subagentType: 'Explore' }),
                        toolCallId: 'task',
                        toolName: 'Agent',
                    }),
                    tool({
                        input: { file_path: 'apps/README.md' },
                        parentToolCallId: 'task',
                        toolCallId: 'read',
                        toolName: 'Read',
                    }),
                ]),
                kind: 'available',
            }}
        />
    );
    assert.match(markup, /Sub-agent failed: Count files in apps/);
    assert.match(markup, /Explore/);
    assert.match(markup, /Read README\.md/);
});

test('an interrupted sub-agent stays closed under a calm stop mark; a failed one opens to why', () => {
    const render = (status: 'failed' | 'interrupted') =>
        renderToStaticMarkup(
            <TurnTracePresentation
                access="journal"
                isPending={false}
                presentation={{
                    journal: journal([
                        tool({
                            error: 'aborted',
                            status,
                            subagent: subagent({ status }),
                            toolCallId: 'task',
                            toolName: 'Agent',
                        }),
                    ]),
                    kind: 'available',
                }}
            />
        );

    // Interrupted is not failed: a calm stop mark, closed, nothing in danger.
    const interrupted = render('interrupted');
    assert.match(interrupted, /Sub-agent interrupted: Count files in apps/);
    assert.match(interrupted, /aria-expanded="false"/);
    assert.doesNotMatch(interrupted, /text-danger|aria-expanded="true"/);

    const failed = render('failed');
    assert.match(failed, /aria-expanded="true"/);
    assert.match(failed, /<svg[^>]*class="size-3\.5 shrink-0 text-danger"/);
    assert.match(
        failed,
        /<p class="whitespace-pre-wrap break-words text-danger text-sm">aborted<\/p>/
    );
});

function toolAt(entries: ReturnType<typeof buildTurnTrace>, index: number): TurnTraceTool {
    const entry = entries[index];
    assert.ok(entry?.kind === 'tool');
    return entry.tool;
}

function subagent(
    overrides: Partial<NonNullable<AgentExecutionJournalTool['subagent']>> = {}
): NonNullable<AgentExecutionJournalTool['subagent']> {
    return {
        endedAt: at(9),
        label: 'Count files in apps',
        startedAt: at(1),
        status: 'completed',
        ...overrides,
    };
}

function at(seconds: number) {
    return new Date(Date.UTC(2026, 2, 31, 15, 0, seconds)).toISOString();
}

function tool(overrides: Partial<AgentExecutionJournalTool>): AgentExecutionJournalTool {
    return {
        endedAt: at(2),
        startedAt: at(1),
        status: 'completed',
        toolCallId: 'call-1',
        toolName: 'Bash',
        ...overrides,
    };
}

function journal(tools: AgentExecutionJournalTool[]): AgentExecutionJournal {
    return { runId: 'run_1', startedAt: at(0), status: 'completed', tools };
}
