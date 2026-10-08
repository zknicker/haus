import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ChatMessage } from '@haus/api';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import {
    MemoryRouter,
    type NavigateFunction,
    Route,
    Routes,
    useNavigate,
    useParams,
} from 'react-router-dom';
import { installFakeDom } from '../../../test-support/fake-dom.ts';
import { TrpcTestProvider } from '../../../test-support/trpc-test-provider.tsx';
import { KeptChatViews } from './kept-chat-views.tsx';
import { useChatThreadPane } from './use-chat-thread-pane.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const anchor = { id: 'msg_anchor', sequence: 4 } as ChatMessage;
const transcript = [anchor];
const selected: Record<string, string | null> = {};
const openers: Record<string, () => void> = {};
let navigate: NavigateFunction = () => {};

function ProbeChatView({ chatId }: { chatId: string }) {
    const pane = useChatThreadPane({
        chatId,
        initialTask: undefined,
        revealMessage: () => {},
        serverId: 'server_one',
        transcriptMessages: transcript,
    });
    selected[chatId] = pane.selection?.anchor.id ?? null;
    openers[chatId] = () => pane.open(anchor, null);
    return null;
}

function ChatRoute() {
    navigate = useNavigate();
    const { chatId = '' } = useParams();
    return (
        <KeptChatViews
            chatId={chatId}
            renderChat={(id) => <ProbeChatView chatId={id} />}
            serverId="server_one"
        />
    );
}

test('a kept chat revealed by a route without ?thread= shows no Thread', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    let root: Root | null = null;
    await act(() => {
        root = createRoot(document.createElement('div'));
        root.render(
            <TrpcTestProvider>
                <MemoryRouter initialEntries={['/chat/a']}>
                    <Routes>
                        <Route element={<ChatRoute />} path="/chat/:chatId" />
                    </Routes>
                </MemoryRouter>
            </TrpcTestProvider>
        );
    });
    await act(() => openers.a?.());
    expect(selected.a).toBe('msg_anchor');

    // Back to the Thread's own link: the kept selection still matches the route.
    await act(() => navigate('/chat/b'));
    await act(() => navigate('/chat/a?thread=msg_anchor'));
    expect(selected.a).toBe('msg_anchor');

    // A plain link to the chat: a fresh view would show no Thread, so neither does a kept one.
    await act(() => navigate('/chat/b'));
    await act(() => navigate('/chat/a'));
    expect(selected.a).toBeNull();

    await act(() => (root as Root | null)?.unmount());
});
