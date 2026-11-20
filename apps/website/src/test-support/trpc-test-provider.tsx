import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../lib/haus-server.tsx';

/**
 * A tRPC + React Query context for static-markup tests of components that
 * call `hausTrpc` hooks (preloads, prefetches). Points at an unroutable URL:
 * static rendering never fires the requests, so seed `queryClient` with the
 * reads the component should see.
 */
export function TrpcTestProvider({
    children,
    queryClient = new QueryClient(),
}: {
    children: ReactNode;
    queryClient?: QueryClient;
}) {
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return (
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                {children}
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}

/** `renderToStaticMarkup` inside {@link TrpcTestProvider}. */
export function renderWithTrpc(node: ReactNode, queryClient?: QueryClient): string {
    return renderToStaticMarkup(
        <TrpcTestProvider queryClient={queryClient}>{node}</TrpcTestProvider>
    );
}
