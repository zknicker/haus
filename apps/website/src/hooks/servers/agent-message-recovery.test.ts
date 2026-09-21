import { expect, test } from 'bun:test';
import type { AgentLifecycleEvent } from '@haus/api';
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryClientDefaultOptions, queryPolicy } from '../../lib/query-policy.ts';
import { recoverAgentMessage } from './agent-message-recovery.ts';
import { chatMessagesQueryKey } from './use-chat-messages.ts';

const sending = {
    agentId: 'agt_cove',
    chatId: 'cht_cove',
    compositionId: 'cmp_reply',
    emittedAt: '2026-09-21T14:50:00.000Z',
    phase: 'sending',
    runId: 'run_cove',
    serverId: 'srv_haus',
    text: 'Cove reply',
} satisfies AgentLifecycleEvent;

test.each([
    true,
    false,
])('confirmed send recovers durable history despite an older read (mounted: %s)', async (mounted) => {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const utils = createTRPCQueryUtils({
        client: hausTrpc.createClient({ links: [] }),
        queryClient,
    });
    const queryKey = chatMessagesQueryKey(sending.serverId, sending.chatId);
    const oldRead = Promise.withResolvers<string[]>();
    let reads = 0;
    const options = {
        ...queryPolicy.syncedSnapshot,
        getNextPageParam: () => undefined,
        initialPageParam: undefined,
        queryFn: () =>
            ++reads === 1 ? oldRead.promise : Promise.resolve(['Human request', sending.text]),
        queryKey,
    };
    queryClient.setQueryData(queryKey, { pageParams: [undefined], pages: [['Human request']] });
    const observer = new InfiniteQueryObserver(queryClient, options);
    const close = observer.subscribe(() => {});
    const pendingRead = observer.refetch();
    if (!mounted) {
        close();
    }

    try {
        // No message.created notification is delivered. Later lifecycle phases
        // must neither cancel recovery nor erase the committed reply.
        const recovery = recoverAgentMessage(sending, utils, queryClient);
        await recoverAgentMessage({ ...sending, phase: 'working' }, utils, queryClient);
        await recoverAgentMessage(
            { ...sending, outcome: 'completed', phase: 'settled' },
            utils,
            queryClient
        );
        await recovery;
        oldRead.resolve(['Human request']);
        await pendingRead;

        if (!mounted) {
            expect(reads).toBe(1);
            expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
        }
        const reopened = new InfiniteQueryObserver(queryClient, options);
        const closeReopened = reopened.subscribe(() => {});
        try {
            await queryClient.getQueryCache().find({ queryKey })?.promise;
            expect(reopened.getCurrentResult().data?.pages.flat()).toEqual([
                'Human request',
                'Cove reply',
            ]);
            expect(reads).toBe(2);
        } finally {
            closeReopened();
        }
    } finally {
        close();
        oldRead.resolve(['Human request']);
        queryClient.clear();
    }
});

test('send recovery leaves another Server snapshot untouched', async () => {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const utils = createTRPCQueryUtils({
        client: hausTrpc.createClient({ links: [] }),
        queryClient,
    });
    const otherKey = chatMessagesQueryKey('srv_other', sending.chatId);
    queryClient.setQueryData(otherKey, { pageParams: [undefined], pages: [['Other Server']] });
    try {
        await recoverAgentMessage(sending, utils, queryClient);
        expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
    } finally {
        queryClient.clear();
    }
});
