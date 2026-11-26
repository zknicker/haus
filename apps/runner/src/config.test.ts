import { describe, expect, test } from 'bun:test';
import { parseRunnerConfig } from './config.ts';

describe('runner config', () => {
    test('an empty variable, as compose forwards an unset one, reads as unset', () => {
        expect(
            parseRunnerConfig({
                HAUS_RUNNER_DATA_DIR: '',
                HAUS_RUNNER_MAX_CLAUDE: '',
                HAUS_RUNNER_MAX_WARM: '',
                HAUS_RUNNER_TOKEN: 'runner-token-0123456789abcdef0123456789',
                HAUS_SERVER_URL: 'http://host.docker.internal:18791/',
            })
        ).toEqual({
            dataDir: '/data',
            maxClaude: 6,
            maxWarm: 16,
            runnerToken: 'runner-token-0123456789abcdef0123456789',
            serverUrl: 'http://host.docker.internal:18791',
        });
    });

    test('model logins are not runner settings: a leftover provider key is ignored', () => {
        expect(
            parseRunnerConfig({
                HAUS_RUNNER_CLAUDE_SETUP_TOKEN: 'sk-ant-oat01-leftover',
                HAUS_RUNNER_TOKEN: 'runner-token-0123456789abcdef0123456789',
                HAUS_RUNNER_XAI_API_KEY: 'xai-leftover',
                HAUS_SERVER_URL: 'http://localhost:1',
            })
        ).toEqual({
            dataDir: '/data',
            maxClaude: 6,
            maxWarm: 16,
            runnerToken: 'runner-token-0123456789abcdef0123456789',
            serverUrl: 'http://localhost:1',
        });
    });

    test('an empty runner token is still refused', () => {
        expect(() =>
            parseRunnerConfig({ HAUS_RUNNER_TOKEN: '', HAUS_SERVER_URL: 'http://localhost:1' })
        ).toThrow('Runner environment is invalid: HAUS_RUNNER_TOKEN.');
    });
});
