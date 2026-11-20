import { describe, expect, test } from 'bun:test';
import type { RunnerModelConnection } from '@haus/api';
import { createConnectionBook } from '../model-connections/connection-book.ts';
import { harnessFor } from '../turn/runtime-driver.ts';
import { connectionModels, piModelRef, piProviderFor, piToolFamily } from './pi-models.ts';

const xaiKey: RunnerModelConnection = {
    credential: { key: 'xai-connection-key', kind: 'api-key' },
    id: 'mc_xai',
    label: 'xAI key',
    provider: 'xai',
    serverId: 'srv_1',
    webSearch: true,
};

function opened(connections: readonly RunnerModelConnection[], connection: RunnerModelConnection) {
    const book = createConnectionBook();
    book.replace(connections);
    return connectionModels({
        book,
        connectionId: connection.id,
        link: { send: () => undefined },
        provider: piProviderFor(connection.provider),
    });
}

describe('Pi model selection', () => {
    test('Claude models stay on the Claude Agent SDK and every other model runs on Pi', () => {
        expect(
            [
                'claude-opus-4-5',
                'claude-haiku-4-5',
                'gpt-5.6-sol',
                'grok-4.7',
                'anthropic/claude-fable-5',
            ].map(harnessFor)
        ).toEqual([
            'claude-agent-sdk',
            'claude-agent-sdk',
            'pi-durable',
            'pi-durable',
            'pi-durable',
        ]);
    });

    test('the connection’s provider picks the Pi provider, and the model must be in its catalog', () => {
        const pairs = [
            ['chatgpt', 'gpt-5.6-sol'],
            ['xai', 'grok-4.7'],
            ['gemini', 'gemini-2.5-pro'],
            ['openrouter', 'anthropic/claude-fable-5'],
            ['xai', 'gpt-5.6-sol'],
        ] as const;

        expect(
            pairs.map(([provider, modelId]) =>
                piModelRef(opened([], { ...xaiKey, provider }), modelId)
            )
        ).toEqual([
            { modelId: 'gpt-5.6-sol', provider: 'openai-codex' },
            { modelId: 'grok-4.7', provider: 'xai' },
            { modelId: 'gemini-2.5-pro', provider: 'google' },
            { modelId: 'anthropic/claude-fable-5', provider: 'openrouter' },
            null,
        ]);
        expect(() => piProviderFor('claude')).toThrow(
            'Claude connections run on the Claude Agent SDK, not Pi.'
        );
    });

    test('GPT models get the Codex tool family, every other model the text editor family', () => {
        expect(
            ['gpt-5.6-sol', 'openai/gpt-6-sol', 'grok-4.7', 'gemini-2.5-pro'].map(piToolFamily)
        ).toEqual(['gpt', 'gpt', 'text-editor', 'text-editor']);
    });

    test('provider keys come from the connection, never from ambient XAI_API_KEY', async () => {
        const ambient = process.env.XAI_API_KEY;
        process.env.XAI_API_KEY = 'ambient-key';
        try {
            const missing = opened([], xaiKey);
            const connected = opened([xaiKey], xaiKey);

            expect(await missing.models.checkAuth('xai')).toBeUndefined();
            expect(await connected.models.getAuth('xai')).toMatchObject({
                auth: { apiKey: 'xai-connection-key' },
            });
        } finally {
            if (ambient === undefined) {
                delete process.env.XAI_API_KEY;
            } else {
                process.env.XAI_API_KEY = ambient;
            }
        }
    });

    test('a ChatGPT sign-in is read from the connection, and the book’s current value wins', async () => {
        const chatgpt: RunnerModelConnection = {
            credential: {
                credential: {
                    access: 'access-1',
                    accountId: 'acct_1',
                    expires: Date.now() + 3_600_000,
                    refresh: 'refresh-1',
                },
                kind: 'oauth',
            },
            id: 'mc_chatgpt',
            label: 'Plus',
            provider: 'chatgpt',
            serverId: 'srv_1',
            webSearch: true,
        };
        const book = createConnectionBook();
        const models = connectionModels({
            book,
            connectionId: chatgpt.id,
            link: { send: () => undefined },
            provider: piProviderFor('chatgpt'),
        }).models;
        expect(await models.checkAuth('openai-codex')).toBeUndefined();

        book.replace([chatgpt]);

        expect(await models.checkAuth('openai-codex')).toEqual({ source: 'OAuth', type: 'oauth' });
        expect(await models.getAuth('openai-codex')).toMatchObject({
            auth: { apiKey: 'access-1' },
        });
    });
});
