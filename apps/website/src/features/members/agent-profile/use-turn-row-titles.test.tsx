import { afterAll, beforeAll, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { installFakeDom } from '../../../test-support/fake-dom.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import type { TurnRowTitle } from './agent-turn-row-model.ts';
import { useTurnRowTitles } from './use-turn-row-titles.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

test('a running turn is titled by the trigger it reads before it settles', async () => {
    const running = turn('run_live', 'active', null);
    const settled = turn('run_done', 'settled', {
        chatId: 'cht_product',
        kind: 'reminder',
    });
    const harness = await mount([running, settled]);

    expect(harness.titleOf(running)).toEqual({
        kind: 'text',
        place: '#product',
        request: 'Ship the changelog',
        text: 'Ship the changelog',
    });
    expect(harness.titleOf(settled)).toEqual({
        kind: 'text',
        place: '#product',
        request: 'Reminder',
        text: 'Reminder',
    });
    // Only the running turn asks for its trigger; a settled one already carries it.
    expect(harness.paths().filter((path) => path === 'agent.runTrigger')).toHaveLength(1);
    await harness.unmount();
});

function turn(
    runId: string,
    kind: 'active' | 'settled',
    trigger: AgentActivityTurn['trigger']
): AgentActivityTurn {
    const base = {
        durationMs: 1000,
        events: [],
        messageCount: 0,
        operationCount: 0,
        operations: [],
        runId,
        startedAt: '2026-10-06T12:00:00.000Z',
        trigger,
    };
    return kind === 'active'
        ? { ...base, kind }
        : {
              ...base,
              endedAt: '2026-10-06T12:00:01.000Z',
              failureKind: null,
              kind,
              outputProduced: false,
              status: 'completed',
          };
}

const responses: Record<string, (input: Record<string, unknown>) => unknown> = {
    'agent.runTrigger': (input) => ({
        trigger:
            input.runId === 'run_live'
                ? { author: 'human', chatId: 'cht_product', kind: 'message', messageId: 'msg_live' }
                : null,
    }),
    'chat.list': () => [{ id: 'cht_product', kind: 'channel', name: 'product' }],
    'chat.messages': (input) => ({
        messages: [
            { attachments: [], content: 'Ship the changelog', id: String(input.aroundMessageId) },
        ],
        nextAfterSequence: null,
        nextBeforeSequence: null,
        threads: [],
    }),
};

async function mount(turns: readonly AgentActivityTurn[]) {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const paths: string[] = [];
    const link: TRPCLink<never> =
        () =>
        ({ op }) =>
            observable((observer) => {
                paths.push(op.path);
                const respond = responses[op.path];
                const timer = setTimeout(() => {
                    if (!respond) {
                        observer.error(new Error(`Unexpected ${op.path}`) as never);
                        return;
                    }
                    observer.next({
                        result: { data: respond(op.input as Record<string, unknown>) },
                    });
                    observer.complete();
                }, 1);
                return () => clearTimeout(timer);
            });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = hausTrpc.createClient({ links: [link as never] });
    let latest: ((turn: AgentActivityTurn) => TurnRowTitle) | undefined;
    function Probe() {
        latest = useTurnRowTitles('srv_one', 'agt_one', turns);
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
    for (let pass = 0; pass < 10; pass += 1) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
    return {
        paths: () => paths,
        titleOf: (target: AgentActivityTurn) => {
            if (!latest) {
                throw new Error('Probe has not rendered');
            }
            return latest(target);
        },
        unmount: async () => {
            await act(async () => {
                root?.unmount();
                queryClient.clear();
            });
        },
    };
}
