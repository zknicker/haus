import assert from 'node:assert/strict';
import test from 'node:test';
import { type ContextWindowModel, getChatContextFullness } from './chat-context-fullness.ts';
import type { TranscriptRow } from './transcript-contract.ts';

type ChatRows = TranscriptRow[];

test('getChatContextFullness reads latest agent usage against model context window', () => {
    const rows = [
        {
            actor: { id: 'atlas', kind: 'agent' },
            connectsToNext: false,
            connectsToPrevious: false,
            id: 'message-1',
            isFirstInGroup: true,
            kind: 'message',
            message: {
                content: 'Working on it.',
                id: 'message-1',
                metadata: {
                    model: 'gpt-5.5',
                    provider: 'openrouter',
                    usage: {
                        totalTokens: 50_000,
                    },
                },
                sender: 'Atlas',
                senderType: 'agent',
                sourceSessionId: 'session-1',
                sourceSessionKey: 'session-key-1',
                timestamp: '2026-05-08T18:00:00.000Z',
            },
        },
    ] satisfies ChatRows;
    const models = [
        {
            availability: 'configured',
            capability: 'agent',
            contextWindow: 200_000,
            framework: 'haus',
            id: 'openrouter/gpt-5.5',
            modelId: 'gpt-5.5',
            name: 'GPT-5.5',
            provider: 'openrouter',
            reasoning: null,
            ref: 'openrouter/gpt-5.5',
        },
    ] satisfies Array<ContextWindowModel & Record<string, unknown>>;

    assert.deepEqual(getChatContextFullness({ models, rows }), {
        contextWindow: 200_000,
        percent: 0.25,
        tokenCount: 50_000,
    });
});

test('getChatContextFullness hides when usage or context window is unavailable', () => {
    assert.equal(getChatContextFullness({ models: [], rows: [] }), null);
});
