import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ComputerUseAccessCard } from './computer-use-access-card.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';
const description =
    'Captains can see the screen and click and type in applications on this Device.';

test('a steward of a Mac sees Computer use allowed, off by default, as a switch', () => {
    const html = render({ canChangeComputerUse: true });

    expect(html).toContain('Access');
    expect(html).toContain('Computer use allowed');
    expect(html).toContain(description);
    expect(html).toContain('aria-label="Computer use allowed"');
    expect(html).not.toContain('checked=""');
});

test('a viewer who cannot change it sees the switch disabled', () => {
    const html = render({ canChangeComputerUse: false, computerUseEnabled: true });

    expect(html).toContain('Computer use allowed');
    expect(html).toContain('disabled=""');
});

test('a Device that is not a Mac has no Access section', () => {
    expect(render({ operatingSystem: 'linux' })).toBe('');
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
    utils.agent.list.setData({ serverId }, [] as never);
    utils.computer.desktopActivity.setData({ computerId, serverId }, { commands: [] });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <ComputerUseAccessCard computerId={computerId} serverId={serverId} />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
