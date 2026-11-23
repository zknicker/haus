import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { agentAccessView } from './agent-access-model.ts';
import { ComputerAccessSection } from './computer-access-section.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';
const agents = [
    agent('agt_cove', 'Cove', computerId),
    agent('agt_forge', 'Forge', computerId),
    agent('agt_wren', 'Wren', 'cmp_devicemini00000'),
    agent('agt_pike', 'Pike', 'cmp_devicemini00000'),
];
const wrenGrant = {
    agentId: 'agt_wren',
    grantedAt: new Date('2026-11-22T10:00:00Z'),
    grantedByUserId: 'usr_ada',
};

test('an allowed Captain is a row of its own, and Home Captains are not listed again', () => {
    const html = render({ agentAccessGrants: [wrenGrant] });

    expect(html).toContain('Access');
    expect(html).toContain('aria-label="About Captain access"');
    expect(html).toContain('Wren');
    expect(html).not.toContain('Cove');
    expect(html).not.toContain('Only its Home Captains');
});

test('with nobody allowed, the list says only its Home Captains can run here', () => {
    expect(render({})).toContain('Only its Home Captains');
});

test('the attacher adds through a labeled Add, and a steward removes through the row menu', () => {
    const attacher = render({
        agentAccessGrants: [wrenGrant],
        canGrantAgentAccess: true,
        canRevokeAgentAccess: true,
    });
    expect(attacher).toMatch(/aria-label="Add Captain"[^>]*>Add</u);
    expect(attacher).toContain('aria-label="Wren actions"');

    const admin = render({ agentAccessGrants: [wrenGrant], canRevokeAgentAccess: true });
    expect(admin).not.toContain('aria-label="Add Captain"');
    expect(admin).toContain('aria-label="Wren actions"');

    const member = render({ agentAccessGrants: [wrenGrant] });
    expect(member).not.toContain('aria-label="Add Captain"');
    expect(member).not.toContain('aria-label="Wren actions"');
});

test('the add picker offers only Captains that are neither home nor already allowed', () => {
    const view = agentAccessView({
        agents,
        computerId,
        grants: [wrenGrant],
        personName: () => 'Ada',
    });

    expect(view.home.map((captain) => captain.id)).toEqual(['agt_cove', 'agt_forge']);
    expect(view.granted.map((captain) => captain.id)).toEqual(['agt_wren']);
    expect(view.candidates.map((captain) => captain.id)).toEqual(['agt_pike']);
});

test('a grant whose Agent is gone or now lives here is not listed twice', () => {
    const view = agentAccessView({
        agents,
        computerId,
        grants: [
            { ...wrenGrant, agentId: 'agt_cove' },
            { ...wrenGrant, agentId: 'agt_retired' },
        ],
        personName: () => 'Ada',
    });

    expect(view.granted).toEqual([]);
    expect(view.candidates.map((captain) => captain.id)).toEqual(['agt_pike', 'agt_wren']);
});

function agent(id: string, displayName: string, home: string) {
    return { avatarUrl: null, computerId: home, displayName, id };
}

function render(overrides: Record<string, unknown>) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.computer.list.setData({ serverId }, [
        {
            agentAccessGrants: [],
            canChangeWorkers: false,
            canEnableWorkers: false,
            canGrantAgentAccess: false,
            canRevokeAgentAccess: false,
            workerLimit: 4,
            workersEnabled: false,
            canChangeComputerUse: false,
            computerUseAgents: { kind: 'all' },
            computerUseEnabled: false,
            id: computerId,
            name: 'Studio Mac',
            operatingSystem: 'darwin',
            ...overrides,
        },
    ] as never);
    utils.agent.list.setData({ serverId }, agents as never);
    utils.computer.desktopActivity.setData({ computerId, serverId }, { commands: [] });
    utils.member.list.setData({ serverId }, {
        members: [{ displayName: 'Ada', userId: 'usr_ada' }],
    } as never);
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <ComputerAccessSection computerId={computerId} serverId={serverId} />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
