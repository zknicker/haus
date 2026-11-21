import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ComputerUseAccessCard } from './computer-use-access-card.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';
const askDescription =
    'Every chat asks you once before a Captain clicks or types in applications on this Device';

test('a steward of a Mac sees Computer use with the current value’s description and a select', () => {
    const html = render({ canChangeComputerUse: true });

    expect(html).toContain('Access');
    expect(html).toContain('Computer use');
    expect(html).toContain(askDescription);
    expect(html).toContain('aria-label="Computer use"');
});

test('a viewer who cannot change it sees the value as text', () => {
    const html = render({ canChangeComputerUse: false, computerUseAccess: 'always' });

    expect(html).toContain(
        'Every chat may click and type in applications on this Device without asking'
    );
    expect(html).toContain('Always allow');
    expect(html).not.toContain('aria-label="Computer use"');
});

test('a Device that is not a Mac has no Access section', () => {
    expect(render({ operatingSystem: 'linux' })).toBe('');
});

test('a Mac missing a permission warns under Access', () => {
    const html = render({
        reportedInventory: {
            computerUse: {
                accessibility: 'granted',
                installed: true,
                screenRecording: 'denied',
                version: '0.4.0',
            },
            name: 'Studio Mac',
            runtimes: [],
        },
    });

    expect(html).toContain('Computer use isn’t ready');
    expect(html).toContain('Privacy &amp; Security → Screen Recording');
    expect(html).not.toContain('Privacy &amp; Security → Accessibility');
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
            computerUseAccess: 'ask',
            id: computerId,
            name: 'Studio Mac',
            operatingSystem: 'darwin',
            reportedInventory: { name: 'Studio Mac', runtimes: [] },
            ...overrides,
        },
    ] as never);
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <ComputerUseAccessCard computerId={computerId} serverId={serverId} />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
