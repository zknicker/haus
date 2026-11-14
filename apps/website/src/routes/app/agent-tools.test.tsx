import { afterAll, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { testAgent } from '../../features/members/agent-fixtures.ts';

// Bun keeps module mocks for the rest of the worker, so copy the real hooks first and put
// them back once this file is done (see haus-server-routes.test.tsx).
const actualAdmin = { ...(await import('../../hooks/members/use-agent-connection-admin.ts')) };
const actualGrant = { ...(await import('../../hooks/members/use-agent-grant.ts')) };

mock.module('../../hooks/members/use-agent-connection-admin.ts', () => ({
    useAgentConnectionAdmin: () => ({ isPending: false, setConnectionAdmin: () => undefined }),
}));
mock.module('../../hooks/members/use-agent-grant.ts', () => ({
    useAgentGrant: () => ({ isPending: false, setGrant: () => undefined }),
}));

const { AgentTools } = await import('./agent-tools.tsx');
mock.restore();

afterAll(() => {
    mock.module('../../hooks/members/use-agent-connection-admin.ts', () => actualAdmin);
    mock.module('../../hooks/members/use-agent-grant.ts', () => actualGrant);
});

function render(canManage: boolean, connectionAdmin = false) {
    return renderToStaticMarkup(
        <AgentTools
            agent={testAgent({ connectionAdmin })}
            canManage={canManage}
            connections={[]}
            serverId="srv_one"
        />
    );
}

test('an Owner or Admin sees the connection admin switch with its meaning', () => {
    const markup = render(true);
    expect(markup).toContain('Connection admin');
    expect(markup).toContain('Can turn connection access on and off for any agent');
    expect(markup).toContain('aria-label="Make Fen a connection admin"');
});

test('the switch reflects the Agent record', () => {
    const off = render(true, false);
    const on = render(true, true);
    expect(on).not.toEqual(off);
    expect(on).toMatch(/data-selected="true"/u);
    expect(off).not.toMatch(/data-selected="true"/u);
});

test('a Member never sees the connection admin switch', () => {
    expect(render(false)).not.toContain('Connection admin');
});
