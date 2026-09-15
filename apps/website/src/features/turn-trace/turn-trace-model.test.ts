import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournal } from '@haus/api';
import { buildTurnTrace } from './turn-trace-model.ts';

test('buildTurnTrace has only reasoning and tool rows, ordered by observed time', () => {
    const entries = buildTurnTrace(
        journal({
            reasoning: [
                { id: 'think-1', startedAt: at(2), text: 'Plan the change.' },
                { id: 'think-2', startedAt: at(6), text: 'Check the result.' },
            ],
            tools: [
                { startedAt: at(4), toolCallId: 'call-1', toolName: 'bash', status: 'completed' },
                { startedAt: at(8), toolCallId: 'call-2', toolName: 'read', status: 'running' },
            ],
        })
    );
    assert.deepEqual(
        entries.map((entry) => entry.key),
        ['reasoning:think-1', 'tool:call-1', 'reasoning:think-2', 'tool:call-2']
    );
});

test('a missing journal produces no alternate trace', () => {
    assert.deepEqual(buildTurnTrace(null), []);
});

test('unfinished reasoning preserves its streaming and truncation state', () => {
    const reasoning = [{ id: 'think-1', startedAt: at(1), text: 'Still going.', truncated: true }];
    const live = buildTurnTrace(journal({ reasoning, status: 'running' }))[0];
    const settled = buildTurnTrace(journal({ reasoning }))[0];
    assert.equal(live?.kind === 'reasoning' && live.isStreaming, true);
    assert.equal(settled?.kind === 'reasoning' && settled.isStreaming, false);
    assert.equal(settled?.kind === 'reasoning' && settled.reasoning.truncated, true);
});

test('empty reasoning blocks do not create placeholder rows', () => {
    assert.deepEqual(
        buildTurnTrace(
            journal({
                reasoning: [
                    { id: 'empty', startedAt: at(1), text: '' },
                    { id: 'whitespace', startedAt: at(2), text: '  ' },
                ],
            })
        ),
        []
    );
});

function at(seconds: number) {
    return new Date(Date.UTC(2026, 2, 31, 15, 0, seconds)).toISOString();
}

function journal(overrides: Partial<AgentExecutionJournal> = {}): AgentExecutionJournal {
    return { runId: 'run_1', startedAt: at(0), status: 'completed', tools: [], ...overrides };
}
