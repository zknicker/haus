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
                        Promise.resolve()
                            .then(() => answer(call))
                            .then(
                                (data) => {
                                    observer.next({ result: { data } });
                                    observer.complete();
                                },
                                (cause: unknown) =>
                                    observer.error(TRPCClientError.from(cause as Error))
                            );
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

export async function mountCallHook<T>(
    useHook: () => T,
    answer?: (call: RecordedCall) => unknown,
    seed: (queryClient: QueryClient) => void = () => undefined
) {
    const harness = createCallHarness(answer);
    const box: { current: T | null } = { current: null };
    function Probe() {
        box.current = useHook();
        return null;
    }
    seed(harness.queryClient);
    const mounted = await harness.mount(<Probe />);
    const hook = () => {
        if (!box.current) {
            throw new Error('The hook did not mount.');
        }
        return box.current;
    };
    return { harness, hook, mounted };
}
