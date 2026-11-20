import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ComputerRuntimeIssues } from './computer-runtime-issues.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';

test('an invalid inventory report tells the operator to upgrade Haus Computer', () => {
    const html = render('2026-11-19T12:00:00.000Z', true);

    expect(html).toContain('Invalid inventory');
    expect(html).toContain('Studio Mac reported an inventory this Server could not read.');
    expect(html).toContain('haus-computer upgrade');
});

test('a Computer whose last inventory was valid shows no upgrade notice', () => {
    expect(render(null, false)).not.toContain('haus-computer upgrade');
});

function render(inventoryInvalidAt: string | null, reportsUsage: boolean) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.computer.list.setData({ serverId }, [
        {
            id: computerId,
            inventoryInvalidAt,
            name: 'Studio Mac',
            reportedInventory: { name: 'Studio Mac', runtimes: [] },
        },
    ] as never);
    utils.stats.live.setData({ serverId }, {
        computers: reportsUsage ? [{ computerId, usage: {} }] : [],
    } as never);
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <ComputerRuntimeIssues computerId={computerId} serverId={serverId} />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
