import {
    defaultScheduler,
    notifyManager,
    QueryClient,
    QueryClientProvider,
} from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { hausTrpc } from '../lib/haus-server.tsx';
import { queryClientDefaultOptions } from '../lib/query-policy.ts';

export interface RecordedCall {
    input: unknown;
    path: string;
    type: string;
}

export function createCallHarness(answer: (call: RecordedCall) => unknown = () => null) {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const calls: RecordedCall[] = [];
    const client = hausTrpc.createClient({
        links: [
            () =>
                ({ op }) =>
                    observable((observer) => {
                        const call = { input: op.input, path: op.path, type: op.type };
                        calls.push(call);
                        try {
                            observer.next({ result: { data: answer(call) } });
                            observer.complete();
                        } catch (cause) {
                            observer.error(TRPCClientError.from(cause as Error));
                        }
                        return () => undefined;
                    }),
        ],
    });

    return {
        act: React.act,
        calls,
        queryClient,
        async mount(node: React.ReactNode) {
            const { createRoot } = await import('react-dom/client');
            const container = document.createElement('div');
            let root: Root | null = null;
            notifyManager.setScheduler(queueMicrotask);
            await React.act(() => {
                root = createRoot(container);
                root.render(
                    <QueryClientProvider client={queryClient}>
                        <hausTrpc.Provider client={client} queryClient={queryClient}>
                            {node}
                        </hausTrpc.Provider>
                    </QueryClientProvider>
                );
            });
            return {
                unmount: async () => {
                    await React.act(() => root?.unmount());
                    notifyManager.setScheduler(defaultScheduler);
                },
            };
        },
    };
}
