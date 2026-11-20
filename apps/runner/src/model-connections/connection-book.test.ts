import { afterEach, describe, expect, test } from 'bun:test';
import type { RunnerModelConnection } from '@haus/api';
import { attachRunner, drainCleanups, serverStandIn } from '../runner-test-server.ts';
import {
    connectionForRun,
    createConnectionBook,
    missingConnectionMessage,
} from './connection-book.ts';

afterEach(drainCleanups);

const claudePlan: RunnerModelConnection = {
    credential: { kind: 'setup-token', token: 'sk-ant-oat01-first' },
    credentialVersion: 1,
    id: 'mc_claude',
    label: 'Max plan',
    provider: 'claude',
    serverId: 'srv_1',
    webSearch: true,
};
const xaiKey: RunnerModelConnection = {
    credential: { key: 'xai-connection-key', kind: 'api-key' },
    credentialVersion: 1,
    id: 'mc_xai',
    label: 'xAI key',
    provider: 'xai',
    serverId: 'srv_2',
    webSearch: true,
};

describe('model connection book', () => {
    test('the Server’s snapshot fills the book, and a newer snapshot replaces it whole', async () => {
        const server = serverStandIn();
        const runner = await attachRunner(server);
        await server.frame('runner-inventory');
        expect(runner.book.list()).toEqual([]);

        server.send({ connections: [claudePlan, xaiKey], type: 'runner-model-connections' });
        server.start();
        await runner.host.started;
        expect(runner.book.list()).toEqual([claudePlan, xaiKey]);

        const rotated: RunnerModelConnection = {
            ...claudePlan,
            credential: { kind: 'setup-token', token: 'sk-ant-oat01-second' },
        };
        server.send({ connections: [rotated], type: 'runner-model-connections' });
        server.send({ agentId: 'agt_1', runId: 'run_1', type: 'stop' });
        await runner.host.stopped;
        expect(runner.book.list()).toEqual([rotated]);
        expect(runner.book.get('mc_xai')).toBeUndefined();
    });

    test('a snapshot older than the credential the book holds never replaces it', async () => {
        const book = createConnectionBook();
        const replaced: RunnerModelConnection = {
            ...claudePlan,
            credential: { kind: 'setup-token', token: 'sk-ant-oat01-replaced' },
            credentialVersion: 2,
        };
        await book.replace([replaced]);
        await book.replace([claudePlan]);
        expect(book.get('mc_claude')).toEqual(replaced);

        const renamed = { ...replaced, label: 'Team plan' };
        await book.replace([renamed]);
        expect(book.get('mc_claude')).toEqual(renamed);
    });

    test('a run gets its connection only when the book holds it for the model’s provider', async () => {
        const book = createConnectionBook();
        await book.replace([claudePlan, xaiKey]);

        expect([
            connectionForRun(book, 'mc_claude', 'claude-opus-4-5'),
            connectionForRun(book, 'mc_xai', 'grok-4.7'),
            connectionForRun(book, null, 'claude-opus-4-5'),
            connectionForRun(book, 'mc_gone', 'claude-opus-4-5'),
            connectionForRun(book, 'mc_xai', 'gpt-5.6-sol'),
        ]).toEqual([claudePlan, xaiKey, null, null, null]);
        expect(
            ['claude-opus-4-5', 'gpt-5.6-sol', 'grok-4.7', 'gemini-2.5-pro', 'openai/gpt-6'].map(
                missingConnectionMessage
            )
        ).toEqual([
            'No Claude connection. Connect one in Settings → Models.',
            'No ChatGPT connection. Connect one in Settings → Models.',
            'No xAI connection. Connect one in Settings → Models.',
            'No Gemini connection. Connect one in Settings → Models.',
            'No OpenRouter connection. Connect one in Settings → Models.',
        ]);
    });
});
