import { describe, expect, test } from 'bun:test';
import { modelProviderFor } from '../../packages/haus-api/src/model-connections.ts';
import {
    ensureModelLogin,
    environmentLogins,
    evalLoginLabel,
    providerForModel,
} from './model-login.mjs';

const env = { [environmentLogins.gemini.env]: 'dev-gemini-key' };
const credential = { key: 'dev-gemini-key', kind: 'api-key' };

describe('model login', () => {
    test('an enabled ready connection for the provider is enough', async () => {
        const harness = loginHarness([
            { enabled: true, id: 'mc_1', label: 'Mine', provider: 'gemini', status: 'ready' },
        ]);
        expect(await ensureModelLogin(harness, 'gemini', {})).toBe('connected');
        expect(harness.calls).toEqual([]);
    });

    test('a missing api-key login is added from the environment', async () => {
        const harness = loginHarness([
            { enabled: false, id: 'mc_1', label: 'Mine', provider: 'gemini', status: 'ready' },
        ]);
        expect(await ensureModelLogin(harness, 'gemini', env)).toBe('added');
        expect(harness.calls).toEqual([
            {
                input: { credential, label: evalLoginLabel, provider: 'gemini', serverId: 'srv_1' },
                path: 'modelConnections.add',
            },
        ]);
    });

    test('a failed or disabled eval login is repaired in place, never added twice', async () => {
        const harness = loginHarness([
            {
                enabled: false,
                id: 'mc_eval',
                label: evalLoginLabel,
                provider: 'gemini',
                status: 'failed',
            },
        ]);
        expect(await ensureModelLogin(harness, 'gemini', env)).toBe('repaired');
        const target = { connectionId: 'mc_eval', serverId: 'srv_1' };
        expect(harness.calls).toEqual([
            { input: { ...target, credential }, path: 'modelConnections.replaceCredential' },
            { input: { ...target, enabled: true }, path: 'modelConnections.setEnabled' },
        ]);
    });

    test('a provider with no environment login fails with what to connect', async () => {
        const harness = loginHarness([
            { enabled: true, id: 'mc_1', label: 'Mine', provider: 'gemini', status: 'failed' },
        ]);
        await expect(ensureModelLogin(harness, 'chatgpt', env)).rejects.toThrow(
            'connect one on the stack in Settings → Models'
        );
        await expect(ensureModelLogin(harness, 'claude', env)).rejects.toThrow(
            'none can be added from the environment'
        );
        await expect(ensureModelLogin(harness, 'gemini', {})).rejects.toThrow(
            environmentLogins.gemini.env
        );
        expect(harness.calls).toEqual([]);
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
    const calls = [];
    return {
        calls,
        serverId: 'srv_1',
        trpc: async (path, input) => {
            if (path === 'modelConnections.list') {
                return { connections, runnerModels: [] };
            }
            calls.push({ input, path });
            return { id: input.connectionId ?? 'mc_new' };
        },
    };
}
