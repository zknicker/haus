import { expect, test } from 'bun:test';
import * as React from 'react';
import {
    MemoryRouter,
    type NavigateFunction,
    Route,
    Routes,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router-dom';
import { useViewShown, useViewShownChange } from '../../../hooks/desktop-tabs/view-shown.ts';
import { WindowTitle } from '../../../hooks/shell/use-window-title.ts';
import {
    installKeptChatViewTestDom,
    mountKept,
} from '../../../test-support/kept-chat-views-harness.tsx';
import { KeptChatViews } from './kept-chat-views.tsx';

// Kept chat views stay mounted and effect-alive while hidden, so every
// behavior that used to ride an `<Activity>` remount must gate on presence or
// re-run on reveal. Each test pins one of those invariants; composer, reveal,
// and read gates live in `kept-chat-view-commands.test.tsx`.

installKeptChatViewTestDom();

test('a hidden kept view is inert, aria-hidden, skipped by the renderer, and keeps its effects', async () => {
    const cleanups: string[] = [];
    function Probe({ chatId }: { chatId: string }) {
        React.useEffect(
            () => () => {
                cleanups.push(chatId);
            },
            [chatId]
        );
        return null;
    }
    const { container, show, unmount } = await mountKept((id) => <Probe chatId={id} />);
    await show('a');
    await show('b');

    const views = keptViews(container);
    expect(views.map((view) => view.getAttribute('data-kept-chat-view'))).toEqual([
        'hidden',
        'shown',
    ]);
    const [hidden, shown] = views as [FakeView, FakeView];
    expect(hidden.getAttribute('aria-hidden')).toBe('true');
    expect(hidden.getAttribute('inert')).not.toBeNull();
    expect(hidden.getAttribute('class')).toContain('[content-visibility:hidden]');
    expect(shown.getAttribute('aria-hidden')).toBeNull();
    expect(shown.getAttribute('inert')).toBeNull();
    // Hiding is not unmounting: no effect cleaned up.
    expect(cleanups).toEqual([]);

    await unmount();
});

test('a kept view stacks its chat in a column so the chat cannot outgrow the pane', async () => {
    // In a row, the chat surface's `min-width: auto` took a wide table's
    // min-content and pushed the composer past the pane's right edge.
    const { container, show, unmount } = await mountKept(() => null);
    await show('a');
    const [view] = keptViews(container) as [FakeView];
    expect(view.getAttribute('class')?.split(' ')).toEqual(
        expect.arrayContaining(['flex', 'flex-col', 'min-w-0'])
    );
    await unmount();
});

test('reveal and hide reach useViewShownChange after commit, never on mount', async () => {
    const changes: string[] = [];
    const shownInEffect: Record<string, boolean> = {};
    const activeInEffect: Record<string, boolean> = {};
    // Records, in a passive effect of each commit that flips `active`, what isShown() reads.
    function Probe({ active, chatId }: { active: boolean; chatId: string }) {
        const viewShown = useViewShown();
        useViewShownChange((shown) => changes.push(`${chatId}:${shown}`));
        React.useEffect(() => {
            shownInEffect[chatId] = viewShown.isShown();
            activeInEffect[chatId] = active;
        }, [active, chatId, viewShown]);
        return null;
    }
    const { show, unmount } = await mountKept((id, active) => (
        <Probe active={active} chatId={id} />
    ));
    await show('a');
    expect(changes).toEqual([]);
    await show('b');
    expect(changes).toEqual(['a:false']);
    // isShown() is already current for the subtree's own passive effects.
    expect(shownInEffect).toEqual({ a: false, b: true });
    await show('a');
    expect(changes.slice(1).sort()).toEqual(['a:true', 'b:false']);
    expect(shownInEffect).toEqual({ a: true, b: false });
    expect(activeInEffect).toEqual(shownInEffect);

    await unmount();
});

test('only the shown kept view titles the window, and a reveal retitles it', async () => {
    const { show, unmount } = await mountKept((id) => <WindowTitle title={`#${id}`} />);
    await show('a');
    expect(document.title).toBe('#a — Haus');
    await show('b');
    expect(document.title).toBe('#b — Haus');
    await show('a');
    expect(document.title).toBe('#a — Haus');

    await unmount();
});

test('a hidden kept view keeps the route it last had while shown', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const seen: Record<string, string | null> = {};
    let navigate: NavigateFunction = () => undefined;
    function Probe({ chatId }: { chatId: string }) {
        const [params] = useSearchParams();
        seen[chatId] = params.get('thread');
        return null;
    }
    function ChatRoute() {
        navigate = useNavigate();
        const { chatId = '' } = useParams();
        return (
            <KeptChatViews
                chatId={chatId}
                renderChat={(id) => <Probe chatId={id} />}
                serverId="s"
            />
        );
    }
    const root = createRoot(document.createElement('div'));
    await act(() =>
        root.render(
            <MemoryRouter initialEntries={['/chat/a?thread=t1']}>
                <Routes>
                    <Route element={<ChatRoute />} path="/chat/:chatId" />
                </Routes>
            </MemoryRouter>
        )
    );
    await act(() => navigate('/chat/b?thread=t2'));
    // The hidden view never sees the shown chat's `?thread=`.
    expect(seen).toEqual({ a: 't1', b: 't2' });
    await act(() => navigate('/chat/a'));
    expect(seen).toEqual({ a: null, b: 't2' });

    await act(() => root.unmount());
});

interface FakeView {
    getAttribute: (name: string) => string | null;
}

function keptViews(node: unknown): FakeView[] {
    const element = node as {
        childNodes?: unknown[];
        getAttribute?: (name: string) => string | null;
    };
    const own = element.getAttribute?.('data-kept-chat-view') ? [element as FakeView] : [];
    return [...own, ...(element.childNodes ?? []).flatMap(keptViews)];
}
