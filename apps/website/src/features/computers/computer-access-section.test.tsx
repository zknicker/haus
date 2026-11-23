import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils, getQueryKey } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ComputerAccessSection } from './computer-access-section.tsx';
import { ComputerUsePermissionWarning } from './computer-use-permissions.tsx';
import { ComputerWorkersSection } from './computer-workers-section.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';
const agents = [
    { avatarUrl: null, computerId, displayName: 'Cove', id: 'agt_cove' },
    { avatarUrl: null, computerId: 'cmp_devicemini00000', displayName: 'Wren', id: 'agt_wren' },
];

test('Access is the #access target, says who can use the Mac, and never says home', () => {
    const html = render(<Access />, { agentAccessGrants: [grant('agt_wren')] });

    expect(html).toMatch(/<section id="access"/u);
    expect(html).toContain('Who can use this Mac.');
    expect(html).toContain('Only Cove and Wren can run tools here.');
    expect(html).toContain('Captains can’t see or control this Mac’s screen.');
    expect(html).not.toMatch(/home/iu);
});

test('a steward gets Choose Captains under Selected Captains, and All hides it', () => {
    const selected = render(<Access />, { canGrantAgentAccess: true, canRevokeAgentAccess: true });
    expect(selected).toContain('Choose Captains');
    expect(selected).toContain('Selected Captains');

    const all = render(<Access />, { agentAccessScope: 'all', canGrantAgentAccess: true });
    expect(all).toContain('Any Captain on this Server can run tools here.');
    expect(all).not.toContain('Choose Captains');
});

test('turning computer use on is the attacher’s, so its select reads the value for others', () => {
    const html = render(<Access />, { computerUseEnabled: true });
    expect(html).toContain('Those Captains can see the screen and click and type in apps.');
});

test('a device that is not a Mac has Captain access but no computer use', () => {
    const html = render(<Access />, { operatingSystem: 'linux' });
    expect(html).toContain('Who can use this device.');
    expect(html).toContain('Captain access');
    expect(html).not.toContain('Computer use');
});

test('Captain access stays readable when the Captain roster fails to load', () => {
    const html = render(<Access />, {}, 'error');
    expect(html).toContain('Couldn’t load Captains.');
    expect(html).toContain('Retry');
});

test('the macOS warning shows only while a permission is missing', () => {
    const granted = render(<Warning readiness={readiness('granted')} />, {});
    expect(granted).toBe('');

    const denied = render(<Warning readiness={readiness('denied')} />, {});
    expect(denied).toContain('macOS permissions');
    expect(denied).toContain('Not granted');
    expect(denied).toContain('Open Settings');
    expect(denied).toContain('Copy path');
    expect(denied).toContain('Check again');
});

test('Workers holds Run Workers here, the local runtimes, and the cloud providers', () => {
    const html = render(<Workers />, {
        reportedInventory: {
            name: 'Studio Mac',
            runtimes: [],
            workerRuntimes: [{ detail: null, ready: true, runtime: 'claude-code' }],
        },
        workersEnabled: true,
    });
    const order = ['Run Workers here', 'Claude Code', 'Codex', 'Cursor'];
    const positions = order.map((label) => html.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain('Coding sessions Captains start on this Mac, using its logins.');
    expect(html).toContain('Captains with access can run up to 4 Workers here at once.');
    expect(html).toContain('Ready');
    expect(html).toContain('Not installed');
});

function Access() {
    return <ComputerAccessSection computerId={computerId} serverId={serverId} />;
}

function Workers() {
    return <ComputerWorkersSection computerId={computerId} serverId={serverId} />;
}

function Warning({ readiness }: { readiness: ReturnType<typeof readinessOf> }) {
    return (
        <ComputerUsePermissionWarning
            computerId={computerId}
            deviceName="Studio Mac"
            readiness={readiness}
            serverId={serverId}
        />
    );
}

function readiness(screenRecording: 'denied' | 'granted') {
    return readinessOf(screenRecording);
}

function readinessOf(screenRecording: 'denied' | 'granted') {
    return {
        accessibility: 'granted',
        installed: true,
        macosVersion: '27.3',
        screenRecording,
        version: '1.3.1',
    } as const;
}

function grant(agentId: string) {
    return { agentId, grantedAt: new Date('2026-11-22T10:00:00Z'), grantedByUserId: 'usr_ada' };
}

function render(
    ui: React.ReactElement,
    overrides: Record<string, unknown>,
    roster: 'error' | 'ready' = 'ready'
) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, retryOnMount: false, staleTime: Number.POSITIVE_INFINITY },
        },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.computer.list.setData({ serverId }, [
        {
            agentAccessGrants: [],
            agentAccessScope: 'selected',
            canChangeComputerUse: true,
            canChangeWorkers: true,
            canEnableComputerUse: false,
            canEnableWorkers: false,
            canGrantAgentAccess: false,
            canRevokeAgentAccess: false,
            computerUseChangedAt: null,
            computerUseEnabled: false,
            health: 'healthy',
            id: computerId,
            name: 'Studio Mac',
            operatingSystem: 'darwin',
            reportedInventory: { name: 'Studio Mac', runtimes: [] },
            workerLimit: 4,
            workersEnabled: false,
            ...overrides,
        },
    ] as never);
    if (roster === 'ready') {
        utils.agent.list.setData({ serverId }, agents as never);
    } else {
        queryClient
            .getQueryCache()
            .build(queryClient, {
                queryKey: getQueryKey(hausTrpc.agent.list, { serverId }, 'query'),
            })
            .setState({ error: new Error('roster down'), status: 'error' });
    }
    utils.computer.desktopActivity.setData({ computerId, serverId }, { commands: [] });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter>{ui}</MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
