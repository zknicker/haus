import assert from 'node:assert/strict';
import test from 'node:test';
import { createDevServerEnvironment } from './dev-stack-server-environment.mjs';

test('Server and hosted Skool use the same worktree port group', () => {
    const environment = createDevServerEnvironment(
        { PATH: '/usr/bin' },
        { websitePort: '42000', hausPort: '42003' },
        'postgres://worktree'
    );
    assert.equal(environment.HAUS_SKOOL_MCP_URL, 'http://127.0.0.1:42001/mcp');
    assert.equal(environment.HAUS_SERVER_PORT, '42003');
    assert.equal(environment.HAUS_DATABASE_URL, 'postgres://worktree');
    assert.equal(environment.HAUS_APP_ORIGIN, 'http://localhost:42000');
    assert.equal(environment.PATH, '/usr/bin');
});

test('explicit app and Skool endpoints override the worktree defaults', () => {
    const environment = createDevServerEnvironment(
        { HAUS_APP_ORIGIN: 'https://app.test', HAUS_SKOOL_MCP_URL: 'https://skool.test/mcp' },
        { websitePort: '42000', hausPort: '42003' },
        'postgres://worktree'
    );
    assert.equal(environment.HAUS_APP_ORIGIN, 'https://app.test');
    assert.equal(environment.HAUS_SKOOL_MCP_URL, 'https://skool.test/mcp');
});
