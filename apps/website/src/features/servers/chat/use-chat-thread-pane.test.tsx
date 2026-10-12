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
import {
    type DesktopTabCommands,
    DesktopTabsContext,
} from '../../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { trackOpenGestures } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { TabIdContext } from '../../../hooks/desktop-tabs/tab-presence.ts';
import { installFakeDom } from '../../../test-support/fake-dom.ts';
import { TrpcTestProvider } from '../../../test-support/trpc-test-provider.tsx';
import { type DesktopShell, DesktopShellContext } from '../../shell/use-tab-navigator.ts';
import { KeptChatViews } from './kept-chat-views.tsx';
import { useChatThreadPane } from './use-chat-thread-pane.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const anchor = { id: 'msg_anchor', sequence: 4 } as ChatMessage;
const selected: Record<string, string | null> = {};
const openers: Record<string, () => void> = {};
let navigate: NavigateFunction = () => {};

function ProbeChatView({ chatId }: { chatId: string }) {
    const pane = useChatThreadPane({
        chatId,
        initialTask: undefined,
        revealMessage: () => {},
        serverId: 'server_one',
        ready: true,
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

function DeepLinkProbe() {
    useChatThreadPane({
        chatId: 'c1',
        initialTask: undefined,
        revealMessage: () => {},
        serverId: 'server_one',
        ready: true,
    });
    return null;
}

test('desktop: a ?thread= deep link is a plain Open on the right, whatever click is in flight', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const calls: unknown[][] = [];
    const tabs = {
        open: (...args: unknown[]) => calls.push(['open', ...args]),
        openTab: (...args: unknown[]) => calls.push(['openTab', ...args]),
    } as unknown as DesktopTabCommands;
    const shell = {
        server: { slug: 'acme' },
        windowNavigate: () => undefined,
    } as unknown as DesktopShell;
    // A Command-click is still dispatching while the effect runs.
    const listeners = new Map<string, (event: Event) => void>();
    const uninstall = trackOpenGestures({
        addEventListener: (type: string, listener: (event: Event) => void) =>
            listeners.set(type, listener),
        removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window);
    let root: Root | null = null;
    await act(() => {
        listeners.get('click')?.({
            button: 1,
            ctrlKey: false,
            isTrusted: true,
            metaKey: false,
            type: 'auxclick',
        } as unknown as Event);
        root = createRoot(document.createElement('div'));
        root.render(
            <TrpcTestProvider>
                <DesktopShellContext value={shell}>
                    <DesktopTabsContext value={tabs}>
                        <TabIdContext value="t0">
                            <MemoryRouter initialEntries={['/s/acme/chats/c1?thread=m1']}>
                                <DeepLinkProbe />
                            </MemoryRouter>
                        </TabIdContext>
                    </DesktopTabsContext>
                </DesktopShellContext>
            </TrpcTestProvider>
        );
    });
    uninstall();
    expect(calls).toEqual([['open', 't0', { kind: 'app', path: '/s/acme/threads/c1/m1' }]]);
    await act(() => (root as Root | null)?.unmount());
});
