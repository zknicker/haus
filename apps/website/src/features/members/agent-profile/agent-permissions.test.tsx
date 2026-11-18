import { afterAll, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { testAgent } from '../agent-fixtures.ts';

// Bun keeps module mocks for the rest of the worker, so copy the real hook first and put it
// back once this file is done (see haus-server-routes.test.tsx).
const actualAdmin = { ...(await import('../../../hooks/members/use-agent-connection-admin.ts')) };

mock.module('../../../hooks/members/use-agent-connection-admin.ts', () => ({
    useAgentConnectionAdmin: () => ({ isPending: false, setConnectionAdmin: () => undefined }),
}));

const { AgentPermissions } = await import('./agent-permissions.tsx');
mock.restore();

afterAll(() => {
    mock.module('../../../hooks/members/use-agent-connection-admin.ts', () => actualAdmin);
});

function render(canManage: boolean, connectionAdmin = false) {
    return renderToStaticMarkup(
        <AgentPermissions
            agent={testAgent({ connectionAdmin })}
            canManage={canManage}
            serverId="srv_one"
        />
    );
}

test('an Owner or Admin sees the Permissions list with the Manage connections row', () => {
    const markup = render(true);
    expect(markup).toContain('Permissions');
    expect(markup).toContain('Manage connections');
    expect(markup).toContain('Can turn connection access on and off for any agent');
    expect(markup).toContain('aria-label="Let Fen manage connections"');
});

test('the Permissions section carries no section description', () => {
    expect(render(true)).not.toContain('Choose what this Agent can manage for other Agents.');
});

test('the switch reflects the Agent record', () => {
    const off = render(true, false);
    const on = render(true, true);
    expect(on).not.toEqual(off);
    expect(on).toMatch(/data-selected="true"/u);
    expect(off).not.toMatch(/data-selected="true"/u);
});

test('a Member sees no Permissions section at all', () => {
    expect(render(false)).toBe('');
});
