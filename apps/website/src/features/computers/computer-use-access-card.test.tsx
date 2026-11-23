import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils, getQueryKey } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ComputerAccessSection } from './computer-access-section.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';
const grantedEverything = {
    accessibility: 'granted',
    installed: true,
    macosVersion: '27.3',
    screenRecording: 'granted',
    version: '1.3.1',
} as const;

test('a steward of a Mac sees Computer use, off by default, as a switch', () => {
    const html = render({ canChangeComputerUse: true });

    expect(html).toContain('aria-label="About Computer use"');
    expect(html).toContain('aria-label="Computer use"');
    expect(html).not.toContain('Computer use allowed');
    expect(html).not.toContain('checked=""');
});

test('a viewer who cannot change it sees the switch disabled', () => {
    const html = render({ canChangeComputerUse: false, computerUseEnabled: true });

    expect(html).toContain('aria-label="Computer use"');
    expect(html).toContain('disabled=""');
});

test('a device that is not a Mac has Captain access and Workers but no computer use', () => {
    const html = render({ computerUseEnabled: true, operatingSystem: 'linux' });
    expect(html).toContain('Captain access');
    expect(html).toContain('Workers can run here');
    expect(html).not.toContain('aria-label="Computer use"');
    expect(html).not.toContain('macOS permissions');
});

test('Access reads Captain access, Workers, Computer use, then macOS permissions', () => {
    const html = render({
        computerUseEnabled: true,
        reportedInventory: { computerUse: grantedEverything, name: 'Studio Mac', runtimes: [] },
    });
    const order = ['Captain access', 'Workers can run here', 'Computer use', 'macOS permissions'];
    const positions = order.map((label) => html.indexOf(`aria-label="About ${label}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
});

test('granted macOS permissions fold into one fact row', () => {
    const html = render({
        computerUseEnabled: true,
        reportedInventory: { computerUse: grantedEverything, name: 'Studio Mac', runtimes: [] },
    });

    expect(html).toContain('macOS permissions');
    expect(html).toContain('Granted');
    expect(html).not.toContain('Open Settings');
    expect(html).not.toContain('Check again');
    expect(html).not.toContain('Copy path');
});

test('with no Captain able to use it, computer use says so instead of a disabled select', () => {
    const html = render({ computerUseEnabled: true });

    expect(html).toContain('No Captains can use this device');
    expect(html).not.toContain('aria-label="Captains allowed to use computer use"');
});

test('only the attacher can turn Workers on; a steward can turn them off and set the limit', () => {
    const member = render({ canChangeWorkers: false, canEnableWorkers: false });
    expect(member).toMatch(/aria-label="Workers can run here"[^>]*disabled=""/u);

    const owner = render({ canChangeWorkers: true, canEnableWorkers: false, workersEnabled: true });
    expect(owner).not.toMatch(/aria-label="Workers can run here"[^>]*disabled=""/u);
    expect(owner).toContain('aria-label="Worker limit"');
    expect(owner).toContain('Up to 4');
});

test('a denied macOS permission opens the troubleshooting rows with a way to grant it', () => {
    const html = render({
        computerUseEnabled: true,
        reportedInventory: {
            computerUse: {
                accessibility: 'granted',
                appPath: '/Users/ada/.local/share/haus-computer/Haus Computer.app',
                installed: true,
                macosVersion: '27.3',
                screenRecording: 'denied',
                version: '1.3.1',
            },
            name: 'Studio Mac',
            runtimes: [],
        },
    });

    expect(html).toContain('System &amp; App Protection Override');
    expect(html).toContain('Granted');
    expect(html).toContain('Screen &amp; System Audio Recording');
    expect(html).toContain('Not granted');
    expect(html).toContain('Open Settings');
    expect(html).toContain('/Users/ada/.local/share/haus-computer/Haus Computer.app');
    expect(html).toContain('Copy path');
    expect(html).toContain('Check again');
});

test('a Mac whose permissions moved to the app says macOS asks again', () => {
    const html = render({
        computerUseEnabled: true,
        reportedInventory: {
            computerUse: {
                accessibility: 'denied',
                installed: true,
                permissionsMoved: true,
                screenRecording: 'denied',
                version: '1.3.1',
            },
            name: 'Studio Mac',
            runtimes: [],
        },
    });

    expect(html).toContain('Haus Computer is an app now, so macOS asks again');
    expect(html).toContain('~/.local/share/haus-computer/Haus Computer.app');
});

test('computer use stays usable when the Captain roster fails to load', () => {
    const html = render({ canChangeComputerUse: true, computerUseEnabled: true }, 'error');

    expect(html).toContain('aria-label="Computer use"');
    expect(html).toContain('Captain access');
    expect(html).toContain('Couldn’t load Captains.');
    expect(html).toContain('Retry');
    expect(html).not.toContain('aria-label="Add Captain"');
});

function render(overrides: Record<string, unknown>, roster: 'error' | 'ready' = 'ready') {
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
            canChangeComputerUse: true,
            canChangeWorkers: false,
            canEnableWorkers: false,
            workerLimit: 4,
            workersEnabled: false,
            computerUseAgents: { kind: 'all' },
            computerUseChangedAt: null,
            computerUseEnabled: false,
            id: computerId,
            name: 'Studio Mac',
            operatingSystem: 'darwin',
            reportedInventory: { name: 'Studio Mac', runtimes: [] },
            ...overrides,
        },
    ] as never);
    if (roster === 'ready') {
        utils.agent.list.setData({ serverId }, [] as never);
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
                <MemoryRouter>
                    <ComputerAccessSection computerId={computerId} serverId={serverId} />
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
