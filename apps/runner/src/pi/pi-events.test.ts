import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ConversationView, RunFailure } from '@earendil-works/pi-durable';
import type { TurnEvent } from '../turn/turn-event.ts';
import { PiTurnEvents } from './pi-events.ts';
import { PiRunFailedError, runFailureEvent } from './pi-failures.ts';

async function capturedViews() {
    const text = await Bun.file(
        join(import.meta.dir, 'fixtures', 'faux-provider-tool-turn.jsonl')
    ).text();
    return text
        .trim()
        .split('\n')
        .map((line) => asView(JSON.parse(line)));
}

function asView(value: unknown) {
    return value as ConversationView;
}

function asFailure(value: unknown) {
    return value as RunFailure;
}

function replay(views: readonly ConversationView[]) {
    let next = 0;
    const [initial, ...rest] = views;
    const derived = new PiTurnEvents(initial as ConversationView, {
        invocations: new Map([['call_1', 'completed']]),
        newId: () => `block_${(next += 1)}`,
    });
    const events: TurnEvent[] = [];
    const failures: unknown[] = [];
    for (const view of rest) {
        const step = derived.advance(view);
        events.push(...step.events);
        if (step.failure) {
            failures.push(step.failure);
        }
    }
    return { events, failures, usage: derived.usage };
}

const progress = { nativeType: 'pi.view', type: 'progress' } as const;

describe('Pi turn events', () => {
    test('a tool-using run captured from pi-durable 1.5.2 with the faux provider becomes TurnEvents', async () => {
        const { events, failures, usage } = replay(await capturedViews());

        expect(events).toEqual([
            progress,
            progress,
            progress,
            { id: 'block_1', type: 'reasoning-start' },
            { id: 'block_1', text: 'I should list the fi', type: 'reasoning-delta' },
            { id: 'block_1', text: 'les first.', type: 'reasoning-delta' },
            { id: 'block_1', type: 'reasoning-end' },
            { input: { command: 'ls' }, toolCallId: 'call_1', toolName: 'bash', type: 'tool-call' },
            {
                contextTokens: 58,
                type: 'step-finish',
                usage: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 58,
                    inputTokens: 58,
                    outputTokens: 13,
                    totalTokens: 71,
                },
            },
            progress,
            {
                invocation: 'completed',
                output: 'a.txt\nb.txt',
                toolCallId: 'call_1',
                toolName: 'bash',
                type: 'tool-result',
            },
            progress,
            progress,
            progress,
            { id: 'block_3', text: 'There are two files ', type: 'text-delta' },
            { id: 'block_3', text: 'here: a.txt and b.txt.', type: 'text-delta' },
            {
                contextTokens: 81,
                type: 'step-finish',
                usage: {
                    cacheReadTokens: 58,
                    cacheWriteTokens: 23,
                    inputTokens: 81,
                    outputTokens: 11,
                    totalTokens: 92,
                },
            },
        ]);
        expect(usage).toEqual({
            cacheReadTokens: 58,
            cacheWriteTokens: 81,
            inputTokens: 139,
            outputTokens: 24,
            totalTokens: 163,
        });
        expect(failures).toEqual([]);
    });

    test('a hand-built compaction entry reports the compaction tool and a new run failure surfaces once', async () => {
        const [base] = await capturedViews();
        const compacted = asView({
            ...base,
            entries: [
                {
                    conversationId: 1,
                    data: { reason: 'threshold' },
                    head: 5,
                    id: 20,
                    kind: 'pi.compaction',
                    model: [{ content: 'We listed two files.', role: 'user', timestamp: 0 }],
                },
            ],
        });
        const failed = asView({
            ...compacted,
            docs: {
                ...compacted.docs,
                'pi.live': {
                    runFailure: {
                        detail: 'HTTP 401: invalid api key',
                        inputs: [8],
                        reason: 'model_error',
                        taskId: 9,
                    },
                },
            },
        });

        const { events, failures } = replay([base as ConversationView, compacted, failed, failed]);

        expect(events).toEqual([
            {
                input: {},
                providerExecuted: true,
                toolCallId: 'pi-compaction-20',
                toolName: 'compaction',
                type: 'tool-call',
            },
            {
                output: { summary: 'We listed two files.', trigger: 'threshold' },
                providerExecuted: true,
                toolCallId: 'pi-compaction-20',
                toolName: 'compaction',
                type: 'tool-result',
            },
            progress,
            progress,
        ]);
        expect(failures).toEqual([
            { detail: 'HTTP 401: invalid api key', inputs: [8], reason: 'model_error', taskId: 9 },
        ]);
    });

    test('a refused login is an access failure and any other unanswered run is a turn error', () => {
        const refusedLogin = runFailureEvent(
            asFailure({
                detail: 'HTTP 401: invalid api key',
                inputs: [],
                reason: 'model_error',
                taskId: 9,
            })
        );
        const turnLimit = runFailureEvent(
            asFailure({ detail: '40 turns', inputs: [], reason: 'turn_limit', taskId: 9 })
        );

        expect(refusedLogin).toEqual({
            category: 'access',
            severity: 'error',
            title: 'HTTP 401: invalid api key',
            type: 'session-failure',
        });
        expect(turnLimit.type === 'error' && turnLimit.error).toBeInstanceOf(PiRunFailedError);
        expect(turnLimit.type === 'error' && String(turnLimit.error)).toBe(
            'PiRunFailedError: The Pi run ended without an answer (turn_limit): 40 turns'
        );
    });
});
