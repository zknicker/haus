import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildSaveInput,
    connectionSetupDescription,
    connectionStatusLabel,
    createConnectionDraft,
    mcpOAuthRedirectUrl,
    splitArgs,
} from './mcp-server-shared.ts';

test('account authorization copy follows the MCP authentication method', () => {
    assert.equal(connectionStatusLabel({ auth: 'oauth', connected: false }), 'Sign in required');
    assert.equal(connectionStatusLabel({ auth: 'oauth', connected: true }), 'Account connected');
    assert.match(connectionSetupDescription({ auth: 'oauth' }), /Sign in to your account/u);
    assert.equal(
        connectionStatusLabel({ auth: 'headers', connected: false }),
        'Credentials required'
    );
    assert.equal(connectionStatusLabel({ auth: 'headers', connected: true }), 'Credentials saved');
    assert.match(connectionSetupDescription({ auth: 'headers' }), /Add credentials/u);
    assert.equal(connectionStatusLabel({ auth: 'none', connected: true }), 'Ready');
    assert.equal(connectionStatusLabel({ auth: 'none', connected: false }), 'Unavailable');
    assert.doesNotMatch(connectionSetupDescription({ auth: 'none' }), /Sign in|credentials/u);
});

test('splitArgs splits on whitespace and drops empty parts', () => {
    assert.deepEqual(splitArgs('  serve  --port 8080 '), ['serve', '--port', '8080']);
});

test('splitArgs returns an empty list for blank input', () => {
    assert.deepEqual(splitArgs('   '), []);
});

test('buildSaveInput includes optional static OAuth registration details', () => {
    assert.deepEqual(
        buildSaveInput({
            ...createConnectionDraft(),
            auth: 'oauth',
            name: 'Example',
            oauthClientId: 'client-id',
            oauthClientSecret: 'secret',
            oauthScopes: 'openid profile',
            url: 'https://example.com/mcp',
        }),
        {
            auth: 'oauth',
            headers: undefined,
            name: 'Example',
            oauthClientId: 'client-id',
            oauthClientSecret: 'secret',
            oauthScopes: ['openid', 'profile'],
            url: 'https://example.com/mcp',
        }
    );
});

test('OAuth callback uses the loopback IP literal instead of localhost', () => {
    assert.equal(
        mcpOAuthRedirectUrl('http://localhost:33791'),
        'http://127.0.0.1:33791/mcp/oauth/callback'
    );
    assert.equal(mcpOAuthRedirectUrl('https://haus.chat'), 'https://haus.chat/mcp/oauth/callback');
});
