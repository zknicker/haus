import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import * as React from 'react';
import { requestChatComposerInsert } from '../../../commands/chat-composer-insert.ts';
import {
    requestMessageReveal,
    takeMessageReveal,
    usePendingMessageReveal,
} from '../../../hooks/servers/use-pending-message-reveal.ts';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import {
    installKeptChatViewTestDom,
    mountKept,
} from '../../../test-support/kept-chat-views-harness.tsx';
import { ChatReadState } from './chat-read-state.tsx';
import { useChatComposerCommands } from './use-chat-composer-commands.ts';
import {
    createVisibleChatSequence,
    type VisibleChatSequence,
} from './use-visible-chat-sequence.ts';

// A hidden kept chat view stays effect-alive: its composer, message reveal, and
// mark-read must act only while shown, and catch up on reveal.

installKeptChatViewTestDom();
const scope = globalThis as Record<string, unknown>;

test('only the shown kept composer answers commands, and a reveal focuses it', async () => {
    const drafts: Record<string, string> = {};
    const focuses: string[] = [];
    function Composer({ chatId }: { chatId: string }) {
        useChatComposerCommands({
            agents: [],
            chatId,
            focusTextEditor: () => focuses.push(chatId),
            insertMention: () => undefined,
            thread: false,
            updateContent: (update) => {
                drafts[chatId] = update(drafts[chatId] ?? '');
            },
        });
        return null;
    }
    const { show, unmount } = await mountKept((id) => <Composer chatId={id} />);
    await show('a');
    await show('b');
    focuses.length = 0;

    await React.act(() => requestChatComposerInsert('quoted'));
    expect(drafts).toEqual({ b: 'quoted' });

    focuses.length = 0;
    await show('a');
    expect(focuses).toEqual(['a']);

    await unmount();
});

test('a hidden kept view leaves a message reveal for its own reveal', async () => {
    const revealed: string[] = [];
    function Probe({ chatId }: { chatId: string }) {
        const reveal = React.useCallback(
            (target: { id: string }) => revealed.push(`${chatId}:${target.id}`),
            [chatId]
        );
        usePendingMessageReveal({ chatId, ready: true, reveal });
        return null;
    }
    const { show, unmount } = await mountKept((id) => <Probe chatId={id} />);
    await show('a');
    await show('b');

    await React.act(() => requestMessageReveal('a', { id: 'msg_1', sequence: 3 }));
    expect(revealed).toEqual([]);
    await show('a');
    expect(revealed).toEqual(['a:msg_1']);
    expect(takeMessageReveal('a')).toBeNull();

    await unmount();
});

test('a hidden kept view never marks its chat read, and a reveal marks through its sequence', async () => {
    const marks: string[] = [];
    const savedFetch = scope.fetch;
    const fakeDocument = document as unknown as Record<string, unknown>;
    fakeDocument.hasFocus = () => true;
    fakeDocument.visibilityState = 'visible';
    scope.fetch = (input: unknown, init?: { body?: unknown }) => {
        const url = String(input);
        if (url.includes('chat.markRead')) {
            marks.push(String(init?.body ?? url));
        }
        return Promise.reject(new Error('offline'));
    };
    const sequences: Record<string, VisibleChatSequence> = {
        a: createVisibleChatSequence(),
        b: createVisibleChatSequence(),
    };
    try {
        const { show, unmount } = await mountKept(
            (id) => (
                <ChatReadState
                    chatId={id}
                    enabled
                    serverId="s"
                    visibleSequence={sequences[id] as VisibleChatSequence}
                />
            ),
            StableTrpc
        );
        await show('a');
        await show('b');
        marks.length = 0;

        // Rows scrolling into view in a hidden chat mark nothing.
        await React.act(() => sequences.a?.set(7));
        await React.act(() => new Promise((resolve) => setTimeout(resolve, 20)));
        expect(marks).toEqual([]);

        await show('a');
        await React.act(() => new Promise((resolve) => setTimeout(resolve, 20)));
        expect(marks.length).toBeGreaterThan(0);
        expect(marks.join(' ')).toContain('7');

        await unmount();
    } finally {
        scope.fetch = savedFetch;
    }
});

/** One tRPC client for the test's life; the shared provider builds one per render. */
function StableTrpc({ children }: { children: React.ReactNode }) {
    const [queryClient] = React.useState(() => new QueryClient());
    const [client] = React.useState(() =>
        hausTrpc.createClient({ links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })] })
    );
    return (
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                {children}
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
