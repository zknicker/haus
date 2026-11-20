import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { DockedWorkerProvider } from './docked-worker.tsx';
import { workerFixture } from './worker-fixture.ts';
import { WorkerMessageContext } from './worker-message-context.tsx';

test('the context line renders at once from the Task attached work, before any Worker read', () => {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const work = workerFixture({ id: 'wkr_one', title: 'Fix the composer' });
    const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <DockedWorkerProvider dock={{ current: null }} docked workers={[work]}>
                    <WorkerMessageContext
                        body={{
                            kind: 'worker-report',
                            outcome: 'done',
                            turnId: 'wkt_one',
                            workerId: 'wkr_one',
                        }}
                        serverId="srv_one"
                    />
                </DockedWorkerProvider>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );

    expect(html).toContain('Worker on Cursor');
    expect(html).toContain('Fix the composer');
});
