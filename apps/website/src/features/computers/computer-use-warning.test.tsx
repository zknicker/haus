import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ComputerDetail } from './computer-detail.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';
const title = 'Computer use can’t work on this Mac';

test('computer use on with a permission missing leads the page with one Fix, rows below', () => {
    const html = renderDevice({ computerUseEnabled: true, screenRecording: 'denied' });
    expect(html).toContain(title);
    expect(html).toContain(
        'macOS hasn’t given Haus Computer access, so Captains can’t see or control the screen.'
    );
    expect(html.match(/>Fix<\/button>/gu)).toHaveLength(1);
    expect(html.indexOf(title)).toBeLessThan(html.indexOf('macOS permissions'));
    expect(html).toContain('Open Settings');
});

test('computer use off hides the warning and the macOS permissions section', () => {
    const html = renderDevice({ computerUseEnabled: false, screenRecording: 'denied' });
    expect(html).not.toContain(title);
    expect(html).not.toContain('macOS permissions');
    expect(html).not.toContain('Open Settings');
});

test('a Mac with every permission is quiet', () => {
    const html = renderDevice({ computerUseEnabled: true, screenRecording: 'granted' });
    expect(html).not.toContain(title);
    expect(html).not.toContain('macOS permissions');
});

test('a permission macOS could not check keeps its row but raises no warning', () => {
    const html = renderDevice({ computerUseEnabled: true, screenRecording: 'unknown' });
    expect(html).not.toContain(title);
    expect(html).toContain('macOS permissions');
    expect(html).toContain('Couldn’t check');
});

function renderDevice(input: {
    computerUseEnabled: boolean;
    screenRecording: 'denied' | 'granted' | 'unknown';
}) {
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
            canEnableComputerUse: true,
            canEnableWorkers: false,
            canGrantAgentAccess: false,
            canRevokeAgentAccess: false,
            computerUseChangedAt: null,
            computerUseEnabled: input.computerUseEnabled,
            createdAt: '2026-11-20T10:00:00Z',
            health: 'healthy',
            id: computerId,
            lastConnectedAt: '2026-11-25T10:00:00Z',
            name: 'Studio Mac',
            operatingSystem: 'darwin',
            reportedInventory: {
                computerUse: {
                    accessibility: 'granted',
                    installed: true,
                    macosVersion: '27.3',
                    screenRecording: input.screenRecording,
                    version: '1.3.1',
                },
                name: 'Studio Mac',
                runtimes: [],
            },
            workerLimit: 4,
            workersEnabled: false,
        },
    ] as never);
    utils.agent.list.setData({ serverId }, [] as never);
    utils.computer.desktopActivity.setData({ computerId, serverId }, { commands: [] });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter>
                    <ComputerDetail
                        computerId={computerId}
                        onUpdatePreviewChange={() => undefined}
                        serverId={serverId}
                        serverSlug="devices"
                        updatePreview="live"
                    />
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
