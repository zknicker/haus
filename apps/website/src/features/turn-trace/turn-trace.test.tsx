import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournal, AgentExecutionJournalTool } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTracePresentation } from './turn-trace.tsx';
import { traceTextMaxChars } from './turn-trace-values.ts';

test('TurnTrace tells a member where execution detail lives', () => {
    const markup = render({ access: 'summary', presentation: null });

    assert.match(markup, /Execution details are available to owners and admins\./);
    assert.doesNotMatch(markup, /data-trace-anchor|Started work/);
});

test('TurnTrace states why a journal could not be read without hiding the turn', () => {
    const markup = render({
        presentation: {
            description: 'The assigned Computer is offline. Try again when it is online.',
            kind: 'offline',
            title: 'Detailed activity unavailable offline',
        },
    });

    assert.match(markup, /Detailed activity unavailable offline/);
    assert.doesNotMatch(markup, /Started work/);
});

test('TurnTrace shows reasoning inline without a disclosure, even before the first tool', () => {
    const markup = render({
        presentation: {
            kind: 'available',
            journal: {
                ...journal([]),
                status: 'running',
                reasoning: [
                    { id: 'thinking', startedAt: at(1), text: 'Inspecting the delivery queue.' },
                ],
            },
        },
    });
    assert.match(markup, /Inspecting the delivery queue/);
    assert.doesNotMatch(markup, /chain-of-thought__trigger|aria-expanded/);
});

test('TurnTrace does not flash a loading label or semantic replacement while the first relay is pending', () => {
    const markup = renderToStaticMarkup(
        <TurnTracePresentation access="journal" isPending presentation={null} />
    );
    assert.doesNotMatch(markup, /Loading|Started work|No activity/);
});

test('TurnTrace renders each tool kind with its own evidence', () => {
    const markup = render({
        presentation: {
            journal: journal([
                tool({
                    input: { command: 'bun test' },
                    output: 'ok',
                    toolCallId: 'call-shell',
                    toolName: 'bash',
                }),
                tool({
                    input: { content: 'export const x = 1;', file_path: 'apps/website/src/x.ts' },
                    toolCallId: 'call-write',
                    toolName: 'write',
                }),
                tool({
                    input: {
                        file_path: 'apps/website/src/y.ts',
                        new_string: 'const after = 2;',
                        old_string: 'const before = 1;',
                    },
                    toolCallId: 'call-edit',
                    toolName: 'edit',
                }),
                tool({
                    input: { term: 'mug' },
                    toolCallId: 'call-mcp',
                    toolName: 'mcp__merchbase__products_search_a1b2c3d4',
                }),
            ]),
            kind: 'available',
        },
    });

    assert.match(markup, /bun test/);
    assert.match(markup, /apps\/website\/src\/x\.ts/);
    assert.match(markup, /apps\/website\/src\/y\.ts/);
    assert.match(markup, /const before = 1;/);
    assert.match(markup, /const after = 2;/);
    assert.match(markup, /merchbase/);
    assert.match(markup, /products_search/);
});

test('TurnTrace states what the runtime changed and compacted, not raw arguments', () => {
    const markup = render({
        presentation: {
            journal: journal([
                tool({
                    input: { event: 'modify', path: 'apps/computer/src/index.ts' },
                    output: { event: 'modify', path: 'apps/computer/src/index.ts' },
                    toolCallId: 'call-file-change',
                    toolName: 'fileChange',
                }),
                tool({
                    input: {},
                    output: {
                        summary: 'Condensed the earlier turns.',
                        tokensAfter: 20_000,
                        tokensBefore: 140_000,
                        trigger: 'auto',
                    },
                    toolCallId: 'call-compaction',
                    toolName: 'compaction',
                }),
            ]),
            kind: 'available',
        },
    });

    assert.match(markup, /Modified apps\/computer\/src\/index\.ts/);
    assert.match(markup, /Compacted the context/);
    assert.match(markup, /Condensed the earlier turns\./);
    assert.doesNotMatch(markup, /Used compaction/);
    assert.doesNotMatch(markup, /Used fileChange/);
});

test('TurnTrace bounds a single unbroken line of tool output', () => {
    const markup = render({
        presentation: {
            journal: journal([
                tool({
                    input: { command: 'cat huge.log' },
                    output: 'x'.repeat(traceTextMaxChars * 2),
                    toolCallId: 'call-huge',
                    toolName: 'bash',
                }),
            ]),
            kind: 'available',
        },
    });

    assert.equal(markup.match(/x{100,}/g)?.[0]?.length, traceTextMaxChars);
    assert.match(markup, /Only the first 20,000 characters are shown\./);
});

test('TurnTrace opens a failed tool so the error is the first thing read', () => {
    const markup = render({
        presentation: {
            journal: journal([
                tool({ toolCallId: 'call-ok', toolName: 'read' }),
                tool({
                    error: 'Permission denied',
                    status: 'failed',
                    toolCallId: 'call-bad',
                    toolName: 'bash',
                }),
            ]),
            kind: 'available',
        },
    });

    assert.equal(markup.match(/aria-expanded="true"/g)?.length, 1);
    assert.match(markup, /Permission denied/);
});

function render(input: {
    access?: 'journal' | 'summary';
    presentation: Parameters<typeof TurnTracePresentation>[0]['presentation'];
}) {
    return renderToStaticMarkup(
        <TurnTracePresentation
            access={input.access ?? 'journal'}
            isPending={false}
            presentation={input.presentation}
        />
    );
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
        toolName: 'bash',
        ...overrides,
    };
}

function journal(tools: AgentExecutionJournalTool[]): AgentExecutionJournal {
    return { runId: 'run_1', startedAt: at(0), status: 'completed', tools };
}
