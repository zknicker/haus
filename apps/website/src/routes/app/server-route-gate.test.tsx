import { afterAll, beforeAll, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ActivationFrame } from '../../components/activation/activation-frame.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { ServerRouteGate } from './server-route-gate.tsx';

let restore: () => void = () => undefined;

beforeAll(() => {
    restore = installFakeDom();
});

afterAll(() => {
    restore();
});

test('an unresolved Server keeps the activation frame instead of rendering an empty Server', async () => {
    const container = await mountServerRoute('opening');
    expect(container.textContent).toContain('Opening Haus');
    expect(container.textContent).not.toContain('Server shell');
});

test('an unavailable Server says so inside the activation frame', async () => {
    const container = await mountServerRoute('gone');
    expect(container.textContent).toContain('Server Unavailable');
    expect(container.textContent).toContain('No Haus server exists at /gone.');
    expect(container.textContent).not.toContain('Server shell');
});

test('a resolved Server opens its shell', async () => {
    const container = await mountServerRoute('dev');
    expect(container.textContent).toContain('Server shell');
    expect(container.textContent).not.toContain('Opening Haus');
});

async function mountServerRoute(slug: 'dev' | 'gone' | 'opening') {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    const client = hausTrpc.createClient({
        links: [
            () => () =>
                observable((observer) => {
                    if (slug === 'gone') {
                        observer.error(
                            TRPCClientError.from({
                                error: {
                                    code: -32_004,
                                    data: { code: 'NOT_FOUND' },
                                    message: 'No Haus server exists at /gone.',
                                },
                            })
                        );
                    }
                    if (slug === 'dev') {
                        observer.next({
                            result: {
                                data: {
                                    channels: [],
                                    displayName: 'Dev Server',
                                    id: 'srv_dev',
                                    role: 'owner',
                                    slug: 'dev',
                                    viewerUserId: 'usr_dev',
                                },
                            },
                        });
                        observer.complete();
                    }
                    return () => undefined;
                }),
        ],
    });
    if (slug !== 'opening') {
        await createTRPCQueryUtils({ client, queryClient }).server.bySlug.prefetch({ slug });
    }
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    const root = createRoot(container);
    await React.act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <hausTrpc.Provider client={client} queryClient={queryClient}>
                    <ActivationFrame showsMark>
                        <MemoryRouter initialEntries={[`/s/${slug}`]}>
                            <Routes>
                                <Route element={<ServerRouteGate />} path="/s/:slug">
                                    <Route element={<span>Server shell</span>} index />
                                </Route>
                            </Routes>
                        </MemoryRouter>
                    </ActivationFrame>
                </hausTrpc.Provider>
            </QueryClientProvider>
        );
    });
    return container;
}
