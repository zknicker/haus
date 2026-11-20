import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import type { InvocationOutcome } from '@haus/api';
import type { TurnEvent } from '../turn/turn-event.ts';
import { parseClaudeMessage } from './claude-messages.ts';
import { ClaudeNormalizer } from './claude-normalizer.ts';
import { ClaudeTurnSteers } from './claude-turn-steers.ts';

const toolCallId = 'toolu_01X3p4asrkkWuqZsz1j31jk1';
const promptId = '32864178-df2f-4554-9266-4eb251f4916c';
const steerId = '14df58e0-3e00-49ba-b734-436d6730f028';

const fixture = (
    await readFile(new URL('./fixtures/steer-mid-tool.jsonl', import.meta.url), 'utf8')
)
    .trim()
    .split('\n')
    .map(parseLine);

function normalizer(invocations: [string, InvocationOutcome][] = []) {
    let next = 0;
    return new ClaudeNormalizer({
        invocations: new Map(invocations),
        newId: () => `block-${++next}`,
        now: () => Date.parse('2026-11-19T12:00:00Z'),
    });
}

function work(events: TurnEvent[]) {
    return events.filter((event) => event.type !== 'progress');
}

const text = (fragment: string) => ({ id: 'block-4', text: fragment, type: 'text-delta' as const });

test('a captured turn with a steer mid-tool normalizes to the spec vocabulary', () => {
    const claude = normalizer([[toolCallId, 'completed']]);
    const events = fixture.flatMap((message) => claude.normalize(parseClaudeMessage(message)));
    expect(work(events)).toEqual([
        { id: 'block-1', type: 'reasoning-start' },
        { id: 'block-1', type: 'reasoning-end' },
        {
            input: { command: 'sleep 5' },
            nativeName: 'mcp__haus__bash',
            toolCallId,
            toolName: 'bash',
            type: 'tool-call',
        },
        {
            contextTokens: 2490,
            type: 'step-finish',
            usage: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                inputTokens: 2490,
                outputTokens: 110,
                totalTokens: 2600,
            },
        },
        {
            invocation: 'completed',
            nativeName: 'mcp__haus__bash',
            output: 'ran:sleep 5',
            toolCallId,
            toolName: 'bash',
            type: 'tool-result',
        },
        { id: 'block-3', type: 'reasoning-start' },
        { id: 'block-3', type: 'reasoning-end' },
        text('Done'),
        text('. '),
        text('\n\nAlso'),
        text(','),
        text(' here'),
        text("'s the word you"),
        text(' asked'),
        text(' for: **banana**'),
        {
            contextTokens: 2729,
            type: 'step-finish',
            usage: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                inputTokens: 2729,
                outputTokens: 78,
                totalTokens: 2807,
            },
        },
    ]);
    expect(events.filter((event) => event.type === 'progress')).toHaveLength(31);
});

test('the captured lifecycle receipts mark the steer consumed, and a cut stream leaves it unconsumed', () => {
    const lifecycles = fixture.flatMap((message) => {
        const parsed = parseClaudeMessage(message).message;
        return parsed.kind === 'lifecycle' ? [parsed.message] : [];
    });
    const steers = new ClaudeTurnSteers();
    steers.track(steerId, 'Also tell me the word banana.');
    steers.delivered(steerId);
    const throughQueued = lifecycles.slice(0, 3);
    for (const lifecycle of throughQueued) {
        steers.onLifecycle(lifecycle);
    }
    expect(steers.pending).toBe(true);
    expect(steers.unconsumed()).toEqual(['Also tell me the word banana.']);
    for (const lifecycle of lifecycles.slice(3)) {
        steers.onLifecycle(lifecycle);
    }
    expect(steers.pending).toBe(false);
    expect(steers.unconsumed()).toEqual([]);
    expect(lifecycles.map((lifecycle) => [lifecycle.command_uuid, lifecycle.state])).toEqual([
        [promptId, 'queued'],
        [promptId, 'started'],
        [steerId, 'queued'],
        [steerId, 'started'],
        [steerId, 'completed'],
    ]);
});

test('a rejected login is a fatal access failure, and a provider tool keeps its identity', () => {
    const claude = normalizer();
    const auth = claude.normalize(
        parseClaudeMessage({
            error: 'authentication_failed',
            message: {
                content: [{ text: 'Invalid API key · Fix external API key', type: 'text' }],
            },
            parent_tool_use_id: null,
            session_id: 'session-1',
            type: 'assistant',
        })
    );
    expect(auth).toEqual([
        {
            category: 'access',
            severity: 'error',
            title: 'Invalid API key · Fix external API key',
            type: 'session-failure',
        },
    ]);
    const call = claude.normalize(
        parseClaudeMessage({
            message: {
                content: [
                    {
                        id: 'toolu_web',
                        input: { query: 'haus' },
                        name: 'WebSearch',
                        type: 'tool_use',
                    },
                ],
            },
            parent_tool_use_id: null,
            type: 'assistant',
        })
    );
    const result = claude.normalize(
        parseClaudeMessage({
            message: {
                content: [{ content: 'Results', tool_use_id: 'toolu_web', type: 'tool_result' }],
            },
            parent_tool_use_id: null,
            tool_use_result: { query: 'haus', results: [] },
            type: 'user',
        })
    );
    expect([...call, ...result]).toEqual([
        {
            input: { query: 'haus' },
            nativeName: 'WebSearch',
            providerExecuted: true,
            toolCallId: 'toolu_web',
            toolName: 'webSearch',
            type: 'tool-call',
        },
        {
            nativeName: 'WebSearch',
            output: { query: 'haus', results: [] },
            providerExecuted: true,
            toolCallId: 'toolu_web',
            toolName: 'webSearch',
            type: 'tool-result',
        },
    ]);
});

function parseLine(line: string) {
    const value: unknown = JSON.parse(line);
    return value;
}
