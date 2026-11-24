import { expect, test } from 'bun:test';
import type { ComputerUseReadiness } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils, getQueryKey } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { CaptainAvatars } from './captain-avatars.tsx';
import { CaptainChooser } from './captain-chooser.tsx';
import { ComputerAccessSection } from './computer-access-section.tsx';
import { ComputerUsePermissions } from './computer-use-permissions.tsx';
import { ComputerWorkersSection } from './computer-workers-section.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';
const agents = [
    { avatarUrl: null, computerId, displayName: 'Cove', id: 'agt_cove' },
    { avatarUrl: null, computerId: 'cmp_devicemini00000', displayName: 'Wren', id: 'agt_wren' },
];

test('Access is the #access target, names who can run tools, and never says home', () => {
    const html = render(<Access />, { agentAccessGrants: [grant('agt_wren')] });

    expect(html).toMatch(/<section id="access"/u);
    expect(html).not.toContain('Who can use this');
    expect(html).toContain('Captains that can run tools on this Mac.');
    expect(html).toContain('Lets those Captains see the screen and use apps.');
    expect(html).not.toMatch(/home/iu);
});

test('the descriptions stay the same whatever the value', () => {
    const off = render(<Access />, {});
    const on = render(<Access />, {
        agentAccessGrants: [grant('agt_wren')],
        agentAccessScope: 'all',
        computerUseEnabled: true,
    });
    for (const sentence of [
        'Captains that can run tools on this Mac.',
        'Lets those Captains see the screen and use apps.',
    ]) {
        expect(off).toContain(sentence);
        expect(on).toContain(sentence);
    }
});

test('Captains shows who has access as avatars, then a Choose Captains button', () => {
    const selected = render(<Access />, {
        agentAccessGrants: [grant('agt_wren')],
        canGrantAgentAccess: true,
        canRevokeAgentAccess: true,
    });
    expect(selected).toMatch(/data-slot="avatar-group"[^>]*role="group"/u);
    expect(selected).toContain('aria-label="Captains with access: Cove, Wren"');
    expect(selected).toContain('aria-label="Cove"');
    expect(selected).toContain('aria-label="Wren"');
    expect(selected).toMatch(/<button[^>]*aria-label="Choose Captains"/u);
    expect(selected).not.toMatch(/<button[^>]*aria-label="Choose Captains"[^>]*disabled=""/u);

    const all = render(<Access />, { agentAccessScope: 'all', canGrantAgentAccess: true });
    expect(all).toContain('>All Captains<');
    expect(all).not.toContain('data-slot="avatar-group"');
    expect(all).toContain('aria-label="Choose Captains"');
});

test('someone who is not a steward sees the avatars but cannot open the chooser', () => {
    const html = render(<Access />, {});
    expect(html).toContain('aria-label="Cove"');
    expect(html).toMatch(
        /<button[^>]*disabled=""[^>]*aria-label="Choose Captains"|<button[^>]*aria-label="Choose Captains"[^>]*disabled=""/u
    );
});

test('with nobody allowed, Captains shows only the Choose Captains button', () => {
    const html = renderToStaticMarkup(
        <CaptainChooser
            canGrant
            canRevoke
            deviceKind="Mac"
            isPending={false}
            onChange={() => undefined}
            onScopeChange={() => undefined}
            scope="selected"
            view={{ granted: [], machine: [], others: [] }}
        />
    );
    expect(html).not.toContain('data-slot="avatar-group"');
    expect(html).not.toContain('All Captains');
    expect(html).toContain('aria-label="Choose Captains"');
});

test('the avatar stack shows four Captains and counts the rest', () => {
    const captains = ['Ash', 'Cove', 'Ink', 'Pike', 'Wren', 'Zed'].map((name) => ({
        avatarUrl: null,
        displayName: name,
        id: `agt_${name.toLowerCase()}`,
    }));
    const html = renderToStaticMarkup(<CaptainAvatars captains={captains} />);
    expect(html.match(/role="img"/gu)).toHaveLength(4);
    expect(html).toContain('aria-label="Captains with access: Ash, Cove, Ink, Pike, Wren, Zed"');
    expect(html).not.toMatch(/tabindex="0"/u);
    expect(html.match(/tabindex="-1"/gu)).toHaveLength(4);
    expect(html).toContain('+2');
});

test('computer use is a switch, and only the attacher can turn it on', () => {
    const on = render(<Access />, { computerUseEnabled: true });
    expect(on).toMatch(/data-slot="switch"[^>]*data-selected="true"/u);
    expect(on).not.toMatch(/data-slot="switch"[^>]*data-disabled="true"/u);

    const off = render(<Access />, { canEnableComputerUse: false, computerUseEnabled: false });
    expect(off).toMatch(/data-slot="switch"[^>]*data-disabled="true"/u);

    const attacher = render(<Access />, { canEnableComputerUse: true, computerUseEnabled: false });
    expect(attacher).not.toMatch(/data-slot="switch"[^>]*data-disabled="true"/u);
});

test('a device that is not a Mac has Captain access but no computer use', () => {
    const html = render(<Access />, { operatingSystem: 'linux' });
    expect(html).toContain('>Captains<');
    expect(html).not.toContain('Computer use');
});

test('Captain access stays readable when the Captain roster fails to load', () => {
    const html = render(<Access />, {}, 'error');
    expect(html).toContain('Couldn’t load Captains.');
    expect(html).toContain('Retry');
});

test('macOS permissions lists only the missing permission, with setup steps off the page', () => {
    const granted = render(<Permissions readiness={readiness('granted')} />, {});
    expect(granted).toBe('');

    const denied = render(<Permissions readiness={readiness('denied')} />, {});
    expect(denied).toContain('macOS permissions');
    expect(denied).toContain('Screen &amp; System Audio Recording');
    expect(denied).not.toContain('System &amp; App Protection Override');
    expect(denied).toMatch(/item-card__description[^>]*>Not granted</u);
    expect(denied).not.toContain('data-slot="badge"');
    expect(denied).toContain('Open Settings');
    expect(denied).not.toContain('Copy path');
    expect(denied).not.toContain('Check again');
    expect(denied).not.toContain('Screen Sharing');
});

test('moved permissions say why macOS asks again, and an old Computer asks for an update', () => {
    const moved = render(
        <Permissions readiness={{ ...readiness('denied'), permissionsMoved: true }} />,
        {}
    );
    expect(moved).toContain('Haus Computer is an app now, so macOS asks again.');

    const missing = render(
        <Permissions readiness={{ ...readiness('denied'), installed: false }} />,
        {}
    );
    expect(missing).toContain('Update Haus Computer on this Mac.');
    expect(missing).not.toContain('Open Settings');
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
    expect(html).toContain('Coding sessions using this Mac’s logins.');
    expect(html).toContain('How many Workers can run here at once.');
    expect(html).not.toContain('Ready');
    expect(html).not.toContain('aria-label="Refresh"');
    expect(html).toContain('Not installed');
});

test('a runtime that is not signed in shows the exception and one Fix button', () => {
    const html = render(<Workers />, {
        reportedInventory: {
            name: 'Studio Mac',
            runtimes: [],
            workerRuntimes: [
                { detail: null, ready: true, runtime: 'claude-code' },
                { detail: 'Run codex login.', ready: false, runtime: 'codex' },
            ],
        },
    });
    expect(html).toContain('Not signed in');
    expect(html.match(/>Fix<\/button>/gu)).toHaveLength(1);
    expect(html).not.toContain('Run codex login.');
});

function Access() {
    return <ComputerAccessSection computerId={computerId} serverId={serverId} />;
}

function Workers() {
    return <ComputerWorkersSection computerId={computerId} serverId={serverId} />;
}

function Permissions({ readiness }: { readiness: ComputerUseReadiness }) {
    return (
        <ComputerUsePermissions
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
