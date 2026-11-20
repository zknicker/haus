import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createRunnerProcessEnvironment,
    createRunnerServerEnvironment,
    createRunnerToken,
    isRunnerLoop,
} from './dev-stack-runner-environment.mjs';

test('the runner starts only when HAUS_AGENT_LOOP is runner', () => {
    assert.equal(isRunnerLoop({ HAUS_AGENT_LOOP: 'runner' }), true);
    assert.equal(isRunnerLoop({ HAUS_AGENT_LOOP: 'computer' }), false);
    assert.equal(isRunnerLoop({}), false);
});

test('each stack run mints a distinct token of at least 43 characters', () => {
    const first = createRunnerToken();
    assert.ok(first.length >= 43);
    assert.match(first, /^[\w-]+$/u);
    assert.notEqual(first, createRunnerToken());
});

test('Server and runner share the token and the loop switch', () => {
    const server = createRunnerServerEnvironment({ PATH: '/usr/bin' }, 'token-a');
    assert.equal(server.HAUS_AGENT_LOOP, 'runner');
    assert.equal(server.HAUS_RUNNER_TOKEN, 'token-a');
    assert.equal(server.PATH, '/usr/bin');
});

test('the runner process gets the Server origin, token, data dir, and logins when present', () => {
    const base = {
        runnerDataRoot: '/data/runner',
        runnerToken: 'token-a',
        serverUrl: 'http://localhost:42003',
    };
    const withSetup = createRunnerProcessEnvironment({
        ...base,
        startupEnvironment: {
            HAUS_RUNNER_CLAUDE_SETUP_TOKEN: 'sk-setup',
            HAUS_RUNNER_XAI_API_KEY: 'xai-key',
            HAUS_DATABASE_URL: 'postgres://secret',
            PATH: '/usr/bin',
        },
    });
    assert.equal(withSetup.HAUS_SERVER_URL, 'http://localhost:42003');
    assert.equal(withSetup.HAUS_RUNNER_TOKEN, 'token-a');
    assert.equal(withSetup.HAUS_RUNNER_DATA_DIR, '/data/runner');
    assert.equal(withSetup.HAUS_RUNNER_CLAUDE_SETUP_TOKEN, 'sk-setup');
    assert.equal(withSetup.HAUS_RUNNER_XAI_API_KEY, 'xai-key');
    assert.equal(withSetup.PATH, '/usr/bin');
    assert.equal(withSetup.HAUS_DATABASE_URL, undefined);
    const without = createRunnerProcessEnvironment({ ...base, startupEnvironment: {} });
    assert.equal('HAUS_RUNNER_CLAUDE_SETUP_TOKEN' in without, false);
});
