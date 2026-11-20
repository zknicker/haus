import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harnessFor } from '../turn/runtime-driver.ts';
import { openFileCredentialStore } from './pi-credentials.ts';
import { answerHeadless } from './pi-login.ts';
import { createPiModels, piModelRef, piToolFamily } from './pi-models.ts';

const directories: string[] = [];

afterEach(async () => {
    for (const directory of directories.splice(0)) {
        await rm(directory, { force: true, recursive: true });
    }
});

async function models(apiKeys: { xaiApiKey: string | null }) {
    const directory = await mkdtemp(join(tmpdir(), 'haus-pi-models-'));
    directories.push(directory);
    const credentials = openFileCredentialStore(directory);
    return {
        credentials,
        models: createPiModels({
            apiKeys: { geminiApiKey: null, openrouterApiKey: null, ...apiKeys },
            credentials,
        }),
    };
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

    test('a model id finds the first provider whose catalog lists it', async () => {
        const { models: catalog } = await models({ xaiApiKey: null });

        expect(
            ['gpt-5.6-sol', 'grok-4.7', 'gemini-2.5-pro', 'anthropic/claude-fable-5', 'nope-1'].map(
                (modelId) => piModelRef(catalog, modelId)
            )
        ).toEqual([
            { modelId: 'gpt-5.6-sol', provider: 'openai-codex' },
            { modelId: 'grok-4.7', provider: 'xai' },
            { modelId: 'gemini-2.5-pro', provider: 'google' },
            { modelId: 'anthropic/claude-fable-5', provider: 'openrouter' },
            null,
        ]);
    });

    test('GPT models get the Codex tool family, every other model the text editor family', () => {
        expect(
            ['gpt-5.6-sol', 'openai/gpt-6-sol', 'grok-4.7', 'gemini-2.5-pro'].map(piToolFamily)
        ).toEqual(['gpt', 'gpt', 'text-editor', 'text-editor']);
    });

    test('provider keys come from runner settings, never from ambient XAI_API_KEY', async () => {
        const ambient = process.env.XAI_API_KEY;
        process.env.XAI_API_KEY = 'ambient-key';
        try {
            const unset = await models({ xaiApiKey: null });
            const set = await models({ xaiApiKey: 'runner-key' });

            expect(await unset.models.checkAuth('xai')).toBeUndefined();
            expect(await set.models.getAuth('xai')).toMatchObject({
                auth: { apiKey: 'runner-key' },
            });
        } finally {
            if (ambient === undefined) {
                delete process.env.XAI_API_KEY;
            } else {
                process.env.XAI_API_KEY = ambient;
            }
        }
    });

    test('the ChatGPT sign-in is read from the credential file', async () => {
        const { credentials, models: catalog } = await models({ xaiApiKey: null });
        expect(await catalog.checkAuth('openai-codex')).toBeUndefined();

        await credentials.modify('openai-codex', async () => ({
            access: 'access-1',
            accountId: 'acct_1',
            expires: Date.now() + 3_600_000,
            refresh: 'refresh-1',
            type: 'oauth',
        }));

        expect(await catalog.checkAuth('openai-codex')).toMatchObject({ type: 'oauth' });
    });

    test('the headless login picks the device-code flow and answers nothing else', async () => {
        expect(
            await answerHeadless({
                message: 'Select OpenAI Codex login method:',
                options: [
                    { id: 'browser', label: 'Browser login (default)' },
                    { id: 'device_code', label: 'Device code login (headless)' },
                ],
                type: 'select',
            })
        ).toBe('device_code');
        await expect(answerHeadless({ message: 'Paste the code:', type: 'text' })).rejects.toThrow(
            'haus-runner login has no terminal prompt to answer "Paste the code:".'
        );
    });
});
