import { afterAll, expect, mock, test } from 'bun:test';
import type { McpConnection } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { testAgent } from '../../features/members/agent-fixtures.ts';

// Bun keeps module mocks for the rest of the worker, so copy the real hook first and put it
// back once this file is done (see haus-server-routes.test.tsx).
const actualGrant = { ...(await import('../../hooks/members/use-agent-grant.ts')) };

mock.module('../../hooks/members/use-agent-grant.ts', () => ({
    useAgentGrant: () => ({ isPending: false, setGrant: () => undefined }),
}));

const { AgentTools } = await import('./agent-tools.tsx');
mock.restore();

afterAll(() => {
    mock.module('../../hooks/members/use-agent-grant.ts', () => actualGrant);
});

function connection(overrides: Partial<McpConnection> = {}): McpConnection {
    return {
        accountLabel: null,
        auth: 'none',
        connected: true,
        grants: [],
        headerNames: [],
        icon: null,
        id: 'mcp_linear0000000000',
        name: 'Linear',
        preset: null,
        serverId: 'srv_one',
        status: 'online',
        summary: null,
        tools: ['list_issues', 'create_issue'],
        url: 'https://mcp.linear.app/mcp',
        ...overrides,
    };
}

function render(connections: McpConnection[]) {
    return renderToStaticMarkup(
        <AgentTools agent={testAgent()} connections={connections} serverId="srv_one" />
    );
}

test('each connected connection with tools gets a switch for this Agent', () => {
    const markup = render([connection()]);
    expect(markup).toContain('Linear');
    expect(markup).toContain('2 tools');
    expect(markup).toContain('aria-label="Enable Linear for Fen"');
});

test('a granted connection renders its switch on', () => {
    const granted = render([
        connection({ grants: [{ agentId: 'agent_one', connectionId: 'mcp_linear0000000000' }] }),
    ]);
    expect(granted).toMatch(/data-selected="true"/u);
    expect(render([connection()])).not.toMatch(/data-selected="true"/u);
});

test('no toggleable connection shows the quiet empty row', () => {
    expect(render([connection({ connected: false })])).toContain('No connections yet.');
});

test('the Connections section no longer carries the connection admin switch', () => {
    expect(render([connection()])).not.toContain('Manage connections');
});
