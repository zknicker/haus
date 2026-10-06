import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentTurnTrigger } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { type TurnTriggerMessage, useTurnTriggerMessages } from './use-turn-trigger-messages.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

test('trigger reads roll through a small window instead of one burst', async () => {
    const triggers = Array.from({ length: 10 }, (_, index) => messageTrigger(`msg_${index}`));
    const harness = await mount(triggers, (id) => (id === 'msg_3' ? null : `Text ${id}`));

    expect(harness.peak()).toBeLessThanOrEqual(4);
    expect(harness.reads()).toBe(10);
    expect(harness.state().get('msg_0')).toMatchObject({
        message: { content: 'Text msg_0' },
        status: 'resolved',
    });
    // A message the reader cannot see settles as unreadable, not as an error.
    expect(harness.state().get('msg_3')).toEqual({ status: 'unreadable' });
    await harness.unmount();
});

test('one message shared by a retry loop is read once; other triggers read nothing', async () => {
    const harness = await mount(
        [
            messageTrigger('msg_same'),
            messageTrigger('msg_same'),
            { kind: 'private' },
            null,
            { chatId: 'cht_one', kind: 'reminder' },
        ],
        (id) => `Text ${id}`
    );
    expect(harness.reads()).toBe(1);
    expect([...harness.state().keys()]).toEqual(['msg_same']);
    await harness.unmount();
});

function messageTrigger(messageId: string): AgentTurnTrigger {
    return { author: 'human', chatId: 'cht_one', kind: 'message', messageId };
}

async function mount(
    triggers: readonly (AgentTurnTrigger | null)[],
    contentOf: (messageId: string) => null | string
) {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    let inFlight = 0;
    let peak = 0;
    let reads = 0;
    const link: TRPCLink<never> =
        () =>
        ({ op }) =>
            observable((observer) => {
                inFlight += 1;
                reads += 1;
                peak = Math.max(peak, inFlight);
                const timer = setTimeout(() => {
                    inFlight -= 1;
                    const id = String((op.input as { aroundMessageId: string }).aroundMessageId);
                    const content = contentOf(id);
                    if (content === null) {
                        observer.error(
                            TRPCClientError.from({
                                error: {
                                    code: -32_004,
                                    data: { code: 'NOT_FOUND', httpStatus: 404 },
                                    message: 'Chat not found',
                                },
                            })
                        );
                        return;
                    }
                    observer.next({
                        result: {
                            data: {
                                messages: [{ attachments: [], content, id }],
                                nextAfterSequence: null,
                                nextBeforeSequence: null,
                                threads: [],
                            },
                        },
                    });
                    observer.complete();
                }, 1);
                return () => clearTimeout(timer);
            });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = hausTrpc.createClient({ links: [link as never] });
    let latest: ReadonlyMap<string, TurnTriggerMessage> | undefined;
    function Probe() {
        latest = useTurnTriggerMessages('srv_one', triggers);
        return null;
    }
    let root: Root | undefined;
    await act(async () => {
        root = createRoot(document.createElement('div') as unknown as Element);
        root.render(
            <QueryClientProvider client={queryClient}>
                <hausTrpc.Provider client={client} queryClient={queryClient}>
                    <Probe />
                </hausTrpc.Provider>
            </QueryClientProvider>
        );
    });
    // Let every window of reads finish.
    for (let pass = 0; pass < 20; pass += 1) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
    return {
        peak: () => peak,
        reads: () => reads,
        state: () => {
            if (!latest) {
                throw new Error('Probe has not rendered');
            }
            return latest;
        },
        unmount: async () => {
            await act(async () => {
                root?.unmount();
                queryClient.clear();
            });
        },
    };
}
