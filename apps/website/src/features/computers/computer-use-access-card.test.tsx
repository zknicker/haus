import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils, getQueryKey } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ComputerAccessSection } from './computer-access-section.tsx';
import { ComputerUsePermissionsSection } from './computer-use-access-card.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';

test('a steward of a Mac sees Computer use allowed, off by default, as a switch', () => {
    const html = render({ canChangeComputerUse: true });

    expect(html).toContain('Computer use');
    expect(html).toContain('Computer use allowed');
    expect(html).toContain('aria-label="About Computer use allowed"');
    expect(html).toContain('aria-label="Computer use allowed"');
    expect(html).not.toContain('checked=""');
});

test('a viewer who cannot change it sees the switch disabled', () => {
    const html = render({ canChangeComputerUse: false, computerUseEnabled: true });

    expect(html).toContain('Computer use allowed');
    expect(html).toContain('disabled=""');
});

test('a Device that is not a Mac has Captain access but no computer use or macOS permissions', () => {
    const html = render({ computerUseEnabled: true, operatingSystem: 'linux' });
    expect(html).toContain('Captain access');
    expect(html).not.toContain('Computer use allowed');
    expect(html).not.toContain('macOS permissions');
});

test('a Mac with Computer use allowed lists each macOS permission with its state and a way to grant it', () => {
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
    expect(html).toContain('Captains');
    expect(html).toContain('All Captains on this Device, including ones added later.');
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

    expect(html).toContain('Computer use allowed');
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
                <ComputerAccessSection computerId={computerId} serverId={serverId} />
                <ComputerUsePermissionsSection computerId={computerId} serverId={serverId} />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
