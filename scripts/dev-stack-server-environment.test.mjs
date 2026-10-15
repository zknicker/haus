import assert from 'node:assert/strict';
import test from 'node:test';
import { createDevServerEnvironment } from './dev-stack-server-environment.mjs';

test('Server owns the worktree endpoint without external Skool configuration', () => {
    const environment = createDevServerEnvironment(
        { PATH: '/usr/bin' },
        { websitePort: '42000', hausPort: '42003' },
        'postgres://worktree'
    );
    assert.equal(environment.HAUS_SKOOL_MCP_URL, undefined);
    assert.equal(environment.HAUS_SKOOL_CONTROL_TOKEN, undefined);
    assert.equal(environment.HAUS_SERVER_PORT, '42003');
    assert.equal(environment.HAUS_DATABASE_URL, 'postgres://worktree');
    assert.equal(environment.HAUS_APP_ORIGIN, 'http://localhost:42000');
    assert.equal(environment.PATH, '/usr/bin');
    assert.equal(environment.HAUS_ARTIFACT_R2_ENDPOINT, undefined);
});

test('Server stores Files through the worktree gateway endpoint', () => {
    const environment = createDevServerEnvironment(
        { HAUS_ENABLE_ARTIFACT_STORAGE: 'true' },
        { websitePort: '42000', hausPort: '42003' },
        'postgres://worktree',
        'http://127.0.0.1:51234'
    );
    assert.equal(environment.HAUS_ARTIFACT_R2_ENDPOINT, 'http://127.0.0.1:51234');
});

test('explicit app origin overrides the worktree default', () => {
    const environment = createDevServerEnvironment(
        { HAUS_APP_ORIGIN: 'https://app.test' },
        { websitePort: '42000', hausPort: '42003' },
        'postgres://worktree'
    );
    assert.equal(environment.HAUS_APP_ORIGIN, 'https://app.test');
});
