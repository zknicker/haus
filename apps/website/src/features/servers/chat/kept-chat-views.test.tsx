import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { TabIdContext, useTabPresence } from '../../../hooks/desktop-tabs/tab-presence.ts';
import { useDesktopPageOpeners } from '../../../hooks/desktop-tabs/use-desktop-page-openers.ts';
import { installFakeDom } from '../../../test-support/fake-dom.ts';
import { PageTopbar, ShellTopbar, TopbarProvider } from '../../shell/shell-topbar.tsx';
import { KeptChatViews, keepChatView } from './kept-chat-views.tsx';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

test('keepChatView keeps render order stable and evicts the least recent chat', () => {
    let kept = keepChatView(null, { chatId: 'a', serverId: 's' }, 3);
    for (const chatId of ['b', 'c', 'a']) {
        kept = keepChatView(kept, { chatId, serverId: 's' }, 3);
    }
    expect(kept.order).toEqual(['a', 'b', 'c']);
    expect(kept.recency).toEqual(['a', 'c', 'b']);

    kept = keepChatView(kept, { chatId: 'd', serverId: 's' }, 3);
    expect(kept.order).toEqual(['a', 'c', 'd']);
    expect(keepChatView(kept, { chatId: 'd', serverId: 's' }, 3)).toBe(kept);
    expect(keepChatView(kept, { chatId: 'd', serverId: 'other' }, 3).order).toEqual(['d']);
});

const mounts: Record<string, number> = {};
const readMarks: string[] = [];
const shownByChat: Record<string, boolean> = {};

/** Stands in for a chat view: counts mounts, and "marks read" the way useChatRead does. */
function FakeChatView({ chatId }: { chatId: string }) {
    React.useState(() => {
        mounts[chatId] = (mounts[chatId] ?? 0) + 1;
        return null;
    });
    const { shown } = useTabPresence();
    shownByChat[chatId] = shown;
    React.useEffect(() => {
        if (shown) {
            readMarks.push(chatId);
        }
    }, [chatId, shown]);
    return <div data-chat={chatId} />;
}

test('returning to a kept chat reveals its view without remounting, and a hidden view marks nothing read', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    let root: Root | null = null;
    const show = (chatId: string) =>
        act(() => {
            root ??= createRoot(container);
            root.render(
                <KeptChatViews
                    chatId={chatId}
                    renderChat={(id) => <FakeChatView chatId={id} />}
                    serverId="s"
                />
            );
        });

    await show('a');
    await show('b');
    expect(shownByChat).toEqual({ a: false, b: true });
    expect(readMarks).toEqual(['a', 'b']);

    readMarks.length = 0;
    await show('a');
    expect(mounts).toEqual({ a: 1, b: 1 });
    expect(shownByChat).toEqual({ a: true, b: false });
    // Only the revealed chat reconnects its effects; the hidden one stays silent.
    expect(readMarks).toEqual(['a']);

    await act(() => root?.unmount());
});

test('a hidden kept view takes its band (a portal) off screen in the same commit', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    const root = createRoot(container);
    const show = (chatId: string) =>
        act(() =>
            root.render(
                <TopbarProvider>
                    <ShellTopbar />
                    <KeptChatViews
                        chatId={chatId}
                        renderChat={(id) => (
                            <PageTopbar>
                                <h1>{id}</h1>
                            </PageTopbar>
                        )}
                        serverId="s"
                    />
                </TopbarProvider>
            )
        );

    await show('a');
    expect(visibleBands(container)).toEqual(['a']);
    await show('b');
    expect(visibleBands(container)).toEqual(['b']);
    await show('a');
    expect(visibleBands(container)).toEqual(['a']);

    await act(() => root.unmount());
});

/** Band titles not under a hidden scope or a display-none node (the fake DOM has no layout). */
function visibleBands(node: Node, hidden = false): string[] {
    const element = node as Partial<HTMLElement>;
    const off =
        hidden || Boolean(element.hasAttribute?.('hidden')) || element.style?.display === 'none';
    if (node.nodeName === 'H1') {
        return off ? [] : [node.textContent ?? ''];
    }
    return Array.from(node.childNodes, (child) => visibleBands(child, off)).flat();
}

const openerRenders: Record<string, number> = {};

/** Reads only the tab id, as a chat view's Thread and artifact openers do. */
const TabIdReader = React.memo(function TabIdReader({ chatId }: { chatId: string }) {
    useDesktopPageOpeners();
    openerRenders[chatId] = (openerRenders[chatId] ?? 0) + 1;
    return null;
});

test('showing or hiding a kept view does not re-render its tab-id readers', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    const root = createRoot(container);
    const show = (chatId: string) =>
        act(() =>
            root.render(
                <TabIdContext value="t1">
                    <KeptChatViews
                        chatId={chatId}
                        renderChat={(id) => <TabIdReader chatId={id} />}
                        serverId="s"
                    />
                </TabIdContext>
            )
        );

    await show('a');
    await show('b');
    await show('a');
    // Presence flipped for both views twice; each reader rendered only when it mounted.
    expect(openerRenders).toEqual({ a: 1, b: 1 });

    await act(() => root.unmount());
});
