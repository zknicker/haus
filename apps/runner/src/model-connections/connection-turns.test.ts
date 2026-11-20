import { afterEach, describe, expect, test } from 'bun:test';
import type { OAuthAuth } from '@earendil-works/pi-ai';
import { fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai/providers/faux';
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai';
import type { RunnerModelConnection } from '@haus/api';
import { fauxProviderAs } from '../pi/pi-faux-run.ts';
import { drainCleanups } from '../runner-test-server.ts';
import { connectedRunner } from './connection-test-host.ts';

afterEach(drainCleanups);

const farFuture = 4_102_444_800_000;
const xaiKey: RunnerModelConnection = {
    credential: { key: 'xai-connection-key', kind: 'api-key' },
    id: 'mc_xai',
    label: 'xAI key',
    provider: 'xai',
    serverId: 'srv_1',
};

function chatgptPlan(access: string, refresh: string, expires: number) {
    const connection: RunnerModelConnection = {
        credential: {
            credential: { access, accountId: 'acct_1', expires, refresh },
            kind: 'oauth',
        },
        id: 'mc_chatgpt',
        label: 'Plus',
        provider: 'chatgpt',
        serverId: 'srv_1',
    };
    return connection;
}

function answered(seen: (string | undefined)[], text: string) {
    return (_context: unknown, options: { apiKey?: string } | undefined) => {
        seen.push(options?.apiKey);
        return fauxAssistantMessage([fauxText(text)]);
    };
}

function refused(detail: string) {
    return fauxAssistantMessage([], { errorMessage: detail, stopReason: 'error' });
}

describe('model connections in turns', () => {
    test('a run without a connection for its model fails as access and never calls a model', async () => {
        const faux = fauxProviderAs('xai', xaiProvider().auth, ['grok-faux']);
        const runner = await connectedRunner(faux.provider);
        runner.server.send({
            connections: [chatgptPlan('access-1', 'refresh-1', farFuture)],
            type: 'runner-model-connections',
        });

        runner.server.start({ modelId: 'grok-faux', runId: 'run_1' });
        expect(await runner.server.frame('turn')).toMatchObject({
            failureCode: 'authentication-required',
            failureKind: 'authentication',
            outputProduced: false,
            runId: 'run_1',
            status: 'failed',
        });
        runner.server.start({
            modelConnectionId: 'mc_chatgpt',
            modelId: 'grok-faux',
            runId: 'run_2',
        });
        expect(await runner.server.frame('turn')).toMatchObject({
            failureCode: 'authentication-required',
            runId: 'run_2',
            status: 'failed',
        });

        expect(faux.core.state.callCount).toBe(0);
        expect(runner.unread('runner-connection-status')).toEqual([]);
    });

    test('a Pi turn on an API key connection sends that key and reports the connection ready', async () => {
        const seen: (string | undefined)[] = [];
        const faux = fauxProviderAs('xai', xaiProvider().auth, ['grok-faux']);
        faux.core.setResponses([answered(seen, 'Hello.')]);
        const runner = await connectedRunner(faux.provider);
        runner.server.send({ connections: [xaiKey], type: 'runner-model-connections' });

        runner.server.start({ modelConnectionId: 'mc_xai', modelId: 'grok-faux' });

        expect(await runner.server.frame('runner-connection-status')).toEqual({
            connectionId: 'mc_xai',
            status: 'ready',
            type: 'runner-connection-status',
        });
        expect(await runner.server.frame('turn')).toMatchObject({ status: 'completed' });
        expect(seen).toEqual(['xai-connection-key']);
    });

    test('status goes up once per change: failed on a refusal, silent on a repeat, ready on recovery', async () => {
        const seen: (string | undefined)[] = [];
        const faux = fauxProviderAs('xai', xaiProvider().auth, ['grok-faux']);
        faux.core.setResponses([
            refused('401 Unauthorized: invalid api key'),
            refused('401 Unauthorized: invalid api key'),
            answered(seen, 'Back.'),
        ]);
        const runner = await connectedRunner(faux.provider);
        runner.server.send({ connections: [xaiKey], type: 'runner-model-connections' });

        runner.server.start({ modelConnectionId: 'mc_xai', modelId: 'grok-faux', runId: 'run_1' });
        expect(await runner.server.frame('runner-connection-status')).toEqual({
            connectionId: 'mc_xai',
            detail: '401 Unauthorized: invalid api key',
            status: 'failed',
            type: 'runner-connection-status',
        });
        expect(await runner.server.frame('turn')).toMatchObject({
            failureCode: 'authentication-required',
            runId: 'run_1',
        });

        runner.server.start({ modelConnectionId: 'mc_xai', modelId: 'grok-faux', runId: 'run_2' });
        expect(await runner.server.frame('turn')).toMatchObject({
            failureCode: 'authentication-required',
            runId: 'run_2',
        });
        expect(runner.unread('runner-connection-status')).toEqual([]);

        runner.server.start({ modelConnectionId: 'mc_xai', modelId: 'grok-faux', runId: 'run_3' });
        expect(await runner.server.frame('runner-connection-status')).toEqual({
            connectionId: 'mc_xai',
            status: 'ready',
            type: 'runner-connection-status',
        });
        expect(await runner.server.frame('turn')).toMatchObject({
            runId: 'run_3',
            status: 'completed',
        });
        expect(seen).toEqual(['xai-connection-key']);
    });

    test('a Pi OAuth refresh goes up with the previous refresh token, and the Server’s later snapshot wins', async () => {
        const seen: (string | undefined)[] = [];
        const refreshedFrom: string[] = [];
        const oauth: OAuthAuth = {
            login: () => Promise.reject(new Error('Sign-in is not part of this test.')),
            name: 'ChatGPT plan',
            refresh: (credential) => {
                refreshedFrom.push(credential.refresh);
                return Promise.resolve({
                    access: 'access-2',
                    accountId: 'acct_1',
                    expires: farFuture,
                    refresh: 'refresh-2',
                    type: 'oauth',
                });
            },
            toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
        };
        const faux = fauxProviderAs('openai-codex', { oauth }, ['gpt-faux']);
        faux.core.setResponses([answered(seen, 'First.'), answered(seen, 'Second.')]);
        const runner = await connectedRunner(faux.provider);
        runner.server.send({
            connections: [chatgptPlan('access-1', 'refresh-1', 0)],
            type: 'runner-model-connections',
        });

        runner.server.start({
            modelConnectionId: 'mc_chatgpt',
            modelId: 'gpt-faux',
            runId: 'run_1',
        });
        expect(await runner.server.frame('runner-connection-credential')).toEqual({
            connectionId: 'mc_chatgpt',
            credential: {
                access: 'access-2',
                accountId: 'acct_1',
                expires: farFuture,
                refresh: 'refresh-2',
            },
            previousRefresh: 'refresh-1',
            type: 'runner-connection-credential',
        });
        expect(await runner.server.frame('turn')).toMatchObject({ runId: 'run_1' });
        expect(runner.book.get('mc_chatgpt')).toEqual(
            chatgptPlan('access-2', 'refresh-2', farFuture)
        );

        runner.server.send({
            connections: [chatgptPlan('access-3', 'refresh-3', farFuture)],
            type: 'runner-model-connections',
        });
        runner.server.start({
            modelConnectionId: 'mc_chatgpt',
            modelId: 'gpt-faux',
            runId: 'run_2',
        });
        expect(await runner.server.frame('turn')).toMatchObject({
            runId: 'run_2',
            status: 'completed',
        });

        expect(seen).toEqual(['access-2', 'access-3']);
        expect(refreshedFrom).toEqual(['refresh-1']);
    });

    test('a refresh the provider refuses fails the turn as access and marks the connection failed', async () => {
        const oauth: OAuthAuth = {
            login: () => Promise.reject(new Error('Sign-in is not part of this test.')),
            name: 'ChatGPT plan',
            refresh: () => Promise.reject(new Error('invalid_grant')),
            toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
        };
        const faux = fauxProviderAs('openai-codex', { oauth }, ['gpt-faux']);
        const runner = await connectedRunner(faux.provider);
        runner.server.send({
            connections: [chatgptPlan('access-1', 'refresh-1', 0)],
            type: 'runner-model-connections',
        });

        runner.server.start({ modelConnectionId: 'mc_chatgpt', modelId: 'gpt-faux' });

        expect(await runner.server.frame('runner-connection-status')).toEqual({
            connectionId: 'mc_chatgpt',
            detail: 'OAuth refresh failed for openai-codex: invalid_grant',
            status: 'failed',
            type: 'runner-connection-status',
        });
        expect(await runner.server.frame('turn')).toMatchObject({
            failureCode: 'authentication-required',
        });
        expect(faux.core.state.callCount).toBe(0);
        expect(runner.unread('runner-connection-credential')).toEqual([]);
    });
});
