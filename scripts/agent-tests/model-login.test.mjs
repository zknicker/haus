import { describe, expect, test } from 'bun:test';
import { modelProviderFor } from '../../packages/haus-api/src/model-connections.ts';
import {
    ensureModelLogin,
    environmentLogins,
    evalLoginLabel,
    providerForModel,
} from './model-login.mjs';

describe('model login', () => {
    test('an enabled ready connection for the provider is enough', async () => {
        const harness = loginHarness([{ enabled: true, provider: 'gemini', status: 'ready' }]);
        expect(await ensureModelLogin(harness, 'gemini', {})).toBe('connected');
        expect(harness.added).toEqual([]);
    });

    test('a missing api-key login is added from the environment', async () => {
        const harness = loginHarness([{ enabled: false, provider: 'gemini', status: 'ready' }]);
        const env = { [environmentLogins.gemini.env]: 'dev-gemini-key' };
        expect(await ensureModelLogin(harness, 'gemini', env)).toBe('added');
        expect(harness.added).toEqual([
            {
                credential: { key: 'dev-gemini-key', kind: 'api-key' },
                label: evalLoginLabel,
                provider: 'gemini',
                serverId: 'srv_1',
            },
        ]);
    });

    test('a missing setup-token login is added from the environment', async () => {
        const harness = loginHarness([]);
        const env = { [environmentLogins.claude.env]: 'dev-setup-token' };
        await ensureModelLogin(harness, 'claude', env);
        expect(harness.added[0]?.credential).toEqual({
            kind: 'setup-token',
            token: 'dev-setup-token',
        });
    });

    test('an OAuth provider with no connection fails with what to connect', async () => {
        const harness = loginHarness([{ enabled: true, provider: 'gemini', status: 'failed' }]);
        await expect(ensureModelLogin(harness, 'chatgpt', {})).rejects.toThrow(
            'chatgpt signs in with OAuth'
        );
        await expect(ensureModelLogin(harness, 'gemini', {})).rejects.toThrow(
            environmentLogins.gemini.env
        );
        expect(harness.added).toEqual([]);
    });

    test('the provider matches the Server for every runner model family', () => {
        for (const modelId of [
            'claude-opus-5-5',
            'gpt-6.1-terra',
            'grok-4.7',
            'gemini-3.8-flash',
            'z-ai/glm-5.3',
        ]) {
            expect(providerForModel(modelId)).toBe(modelProviderFor(modelId));
        }
    });
});

function loginHarness(connections) {
    const added = [];
    return {
        added,
        serverId: 'srv_1',
        trpc: async (path, input) => {
            if (path === 'modelConnections.list') {
                return { connections, runnerModels: [] };
            }
            if (path === 'modelConnections.add') {
                added.push(input);
                return { id: 'mc_1' };
            }
            throw new Error(`unexpected ${path}`);
        },
    };
}
