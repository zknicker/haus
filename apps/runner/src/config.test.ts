import { describe, expect, test } from 'bun:test';
import { parseRunnerConfig, parseRunnerDataDir } from './config.ts';

describe('runner config', () => {
    test('an empty variable, as compose forwards an unset one, reads as unset', () => {
        const environment = {
            HAUS_RUNNER_CLAUDE_SETUP_TOKEN: '',
            HAUS_RUNNER_DATA_DIR: '',
            HAUS_RUNNER_GEMINI_API_KEY: '',
            HAUS_RUNNER_MAX_WARM: '',
            HAUS_RUNNER_OPENROUTER_API_KEY: '',
            HAUS_RUNNER_TOKEN: 'runner-token-0123456789abcdef0123456789',
            HAUS_RUNNER_WEB_SEARCH: '',
            HAUS_RUNNER_XAI_API_KEY: 'xai-key',
            HAUS_SERVER_URL: 'http://host.docker.internal:18791/',
        };

        expect(parseRunnerConfig(environment)).toEqual({
            claudeSetupToken: null,
            dataDir: '/data',
            geminiApiKey: null,
            maxWarm: 16,
            openrouterApiKey: null,
            runnerToken: 'runner-token-0123456789abcdef0123456789',
            serverUrl: 'http://host.docker.internal:18791',
            webSearch: ['openai-codex', 'xai', 'google', 'openrouter'],
            xaiApiKey: 'xai-key',
        });
        expect(parseRunnerDataDir(environment)).toBe('/data');
    });

    test('web search names the providers it is on for and refuses an unknown one', () => {
        const base = {
            HAUS_RUNNER_TOKEN: 'runner-token-0123456789abcdef0123456789',
            HAUS_SERVER_URL: 'http://localhost:1',
        };

        expect(
            parseRunnerConfig({ ...base, HAUS_RUNNER_WEB_SEARCH: 'openrouter, google' }).webSearch
        ).toEqual(['openrouter', 'google']);
        expect(() => parseRunnerConfig({ ...base, HAUS_RUNNER_WEB_SEARCH: 'brave' })).toThrow(
            'Runner environment is invalid: HAUS_RUNNER_WEB_SEARCH.0.'
        );
    });

    test('an empty runner token is still refused', () => {
        expect(() =>
            parseRunnerConfig({ HAUS_RUNNER_TOKEN: '', HAUS_SERVER_URL: 'http://localhost:1' })
        ).toThrow('Runner environment is invalid: HAUS_RUNNER_TOKEN.');
    });
});
