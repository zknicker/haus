import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createRunnerProcessEnvironment,
    createRunnerServerEnvironment,
    createRunnerToken,
} from './dev-stack-runner-environment.mjs';

test('each stack run mints a distinct token of at least 43 characters', () => {
    const first = createRunnerToken();
    assert.ok(first.length >= 43);
    assert.match(first, /^[\w-]+$/u);
    assert.notEqual(first, createRunnerToken());
});

test('Server and runner share the token', () => {
    const server = createRunnerServerEnvironment({ PATH: '/usr/bin' }, 'token-a');
    assert.equal(server.HAUS_RUNNER_TOKEN, 'token-a');
    assert.equal(server.PATH, '/usr/bin');
});

test('the runner process gets the Server origin, token, and data dir, and never Server secrets', () => {
    const base = {
        runnerDataRoot: '/data/runner',
        runnerToken: 'token-a',
        serverUrl: 'http://localhost:42003',
    };
    const environment = createRunnerProcessEnvironment({
        ...base,
        startupEnvironment: {
            HAUS_DATABASE_URL: 'postgres://secret',
            HAUS_RUNNER_MAX_WARM: '2',
            HAUS_SECRETS_KEY: 'sealing-key',
            PATH: '/usr/bin',
        },
    });
    assert.deepEqual(environment, {
        HAUS_RUNNER_DATA_DIR: '/data/runner',
        HAUS_RUNNER_MAX_WARM: '2',
        HAUS_RUNNER_TOKEN: 'token-a',
        HAUS_SERVER_URL: 'http://localhost:42003',
        PATH: '/usr/bin',
    });
});
