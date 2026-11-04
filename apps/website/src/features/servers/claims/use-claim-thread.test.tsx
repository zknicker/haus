import { expect, test } from 'bun:test';
import type { ChatMessage, ClaimListItem, ThreadSummary } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { chatMessageQueryKey } from '../../../hooks/servers/chat-message-entities.ts';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { type ClaimThread, useClaimThread } from './use-claim-thread.ts';

test('a top-level claim opens the Thread anchored on its own message', () => {
    const thread = renderClaimThread(item({ messageChatId: 'cht_dm' }));

    expect(thread?.anchor.id).toBe('msg_claim');
    expect(thread?.anchor.claim?.number).toBe(4);
    expect(thread?.claimMessage).toBeNull();
    expect(thread?.threadChatId).toBe('cht_thr_claim');
});

test('a Thread claim opens the Thread it sits in, anchored on that Thread’s anchor', () => {
    const anchorSummary = summary('msg_anchor', 'cht_thr_anchor', 5);
    const thread = renderClaimThread(
        item({
            messageChatId: 'cht_thr_anchor',
            summary: summary('msg_anchor', 'cht_thr_anchor', 3),
            threadChatId: 'cht_thr_anchor',
        }),
        { message: message('msg_anchor', 'cht_dm'), thread: anchorSummary }
    );

    // The composer replies to this anchor, so it must never be the claim's
    // in-Thread message: that would ask the Server for a nested Thread.
    expect(thread?.anchor.id).toBe('msg_anchor');
    expect(thread?.claimMessage?.id).toBe('msg_claim');
    expect(thread?.claimMessage?.claim?.number).toBe(4);
    expect(thread?.summary).toEqual(anchorSummary);
    expect(thread?.threadChatId).toBe('cht_thr_anchor');
});

test('a Thread claim waits for its Thread’s anchor rather than anchoring on itself', () => {
    const thread = renderClaimThread(
        item({
            messageChatId: 'cht_thr_anchor',
            summary: summary('msg_anchor', 'cht_thr_anchor', 3),
            threadChatId: 'cht_thr_anchor',
        })
    );

    expect(thread).toBeUndefined();
});

function renderClaimThread(
    listItem: ClaimListItem,
    anchorEntity?: { message: ChatMessage; thread: ThreadSummary | null }
): ClaimThread | undefined {
    const queryClient = new QueryClient();
    if (anchorEntity) {
        queryClient.setQueryData(
            chatMessageQueryKey('srv_one', 'cht_dm', anchorEntity.message.id),
            anchorEntity
        );
    }
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    let result: ClaimThread | undefined;
    function Probe() {
        result = useClaimThread('srv_one', listItem);
        return null;
    }
    renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <Probe />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
    return result;
}

function item({
    messageChatId,
    summary: threadSummary = summary('msg_claim', 'cht_thr_claim', 0),
    threadChatId = 'cht_thr_claim',
}: {
    messageChatId: string;
    summary?: ThreadSummary;
    threadChatId?: string;
}): ClaimListItem {
    return {
        chatKind: 'dm',
        chatName: null,
        chatPeerUserId: 'usr_one',
        message: message('msg_claim', messageChatId),
        claim: {
            assigneeAgentId: 'agt_piper',
            chatId: 'cht_dm',
            claimedAt: '2026-11-02T12:00:00.000Z',
            createdAt: '2026-11-02T12:00:00.000Z',
            createdByAgentId: 'agt_piper',
            createdByUserId: null,
            labels: [],
            live: false,
            messageId: 'msg_claim',
            number: 4,
            origin: 'claimed',
            priority: 'none',
            status: 'in_progress',
            threadChatId,
            tier: 'tracked',
            updatedAt: '2026-11-02T12:00:00.000Z',
            version: 1,
        },
        threadSummary,
    };
}

function message(id: string, chatId: string): ChatMessage {
    return {
        attachments: [],
        author: { kind: 'human', userId: 'usr_one' },
        body: { kind: 'text' },
        chatId,
        cloudAgentWork: [],
        content: 'Can you look at the deploy script?',
        createdAt: '2026-11-02T11:59:00.000Z',
        id,
        imageGenerations: [],
        nonce: `nonce_${id}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence: 1,
        serverId: 'srv_one',
        sessionGeneration: null,
    };
}

function summary(anchorMessageId: string, threadChatId: string, replyCount: number): ThreadSummary {
    return {
        anchorMessageId,
        followed: true,
        latestReplyAt: null,
        recentReplies: [],
        replyCount,
        threadChatId,
        unreadCount: 0,
    };
}
