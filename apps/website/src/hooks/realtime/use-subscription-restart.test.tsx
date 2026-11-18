import { afterAll, beforeAll, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { type StreamRestart, useSubscriptionRestart } from './use-subscription-restart.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const serverId = 'srv_one';
const chatId = 'cht_gone';

test('a chat_missing refusal runs the full Chat deletion, not only the transcript purge', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const chatGet = getQueryKey(hausTrpc.chat.get, { chatId, serverId }, 'query');
    const keptChatGet = getQueryKey(hausTrpc.chat.get, { chatId: 'cht_kept', serverId }, 'query');
    const chatList = getQueryKey(hausTrpc.chat.list, { serverId }, 'query');
    const agentChats = getQueryKey(hausTrpc.agent.chats, { serverId }, 'query');
    queryClient.setQueryData(chatGet, { id: chatId });
    queryClient.setQueryData(keptChatGet, { id: 'cht_kept' });
    queryClient.setQueryData(chatList, []);
    queryClient.setQueryData(agentChats, []);
    const client = hausTrpc.createClient({ links: [] });
    let stream: StreamRestart | undefined;
    function Probe() {
        stream = useSubscriptionRestart('chat.onRead', serverId, undefined, chatId, chatId);
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

    await act(async () => {
        stream?.failed(
            Object.assign(new Error('NOT_FOUND'), {
                data: { code: 'NOT_FOUND', hausRefusal: 'chat_missing' },
            }),
            () => undefined
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(queryClient.getQueryState(chatGet)).toBeUndefined();
    expect(queryClient.getQueryState(keptChatGet)?.data).toEqual({ id: 'cht_kept' });
    expect(queryClient.getQueryState(chatList)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(agentChats)?.isInvalidated).toBe(true);

    await act(async () => {
        root?.unmount();
        queryClient.clear();
    });
});
