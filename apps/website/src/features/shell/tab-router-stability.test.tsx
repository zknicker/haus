import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { type Navigator, type To, useNavigate, useRoutes, useSearchParams } from 'react-router-dom';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { useChatReferenceActivation } from '../servers/chat/use-chat-reference-activation.ts';
import { IsolatedTabRouter } from './tab-router.tsx';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const pushes: string[] = [];
const navigator: Navigator = {
    createHref: () => '#',
    go: () => undefined,
    push: (to: To) => {
        pushes.push(typeof to === 'string' ? to : `${to.pathname ?? ''}${to.search ?? ''}`);
    },
    replace: () => undefined,
};

const identities = {
    activate: new Set<unknown>(),
    navigate: new Set<unknown>(),
    setSearchParams: new Set<unknown>(),
};
let routeRenders = 0;
let rowRenders = 0;
let latest: {
    navigate: ReturnType<typeof useNavigate>;
    setSearchParams: ReturnType<typeof useSearchParams>[1];
} | null = null;

const RowContext = React.createContext<{ activate: unknown } | null>(null);
const onOpenChat = () => undefined;

/** Stands in for the chat view: route hooks feed a memoized context the transcript rows read. */
function ChatRoute() {
    routeRenders += 1;
    const navigate = useNavigate();
    const [, setSearchParams] = useSearchParams();
    const activate = useChatReferenceActivation(onOpenChat);
    identities.navigate.add(navigate);
    identities.setSearchParams.add(setSearchParams);
    identities.activate.add(activate);
    latest = { navigate, setSearchParams };
    const value = React.useMemo(() => ({ activate }), [activate]);
    return (
        <RowContext value={value}>
            <Rows />
        </RowContext>
    );
}

const Rows = React.memo(function Rows() {
    React.use(RowContext);
    rowRenders += 1;
    return null;
});

function TabRoutes() {
    return useRoutes([{ path: 's/:slug/chats/:chatId', element: <ChatRoute /> }]);
}

// A desktop tab runs under a plain `<Router>`, whose stock `useNavigate` hands
// out a new function on every location change. Every callback built on it then
// changes too, and a render context holding one re-renders every transcript row
// in every kept chat view (patches/react-router@7.13.1.patch).
test('a desktop tab keeps navigate and its derived callbacks stable across navigations', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    let root: Root | null = null;
    const show = (path: string, entryKey: string) =>
        act(() => {
            root ??= createRoot(container);
            root.render(
                <IsolatedTabRouter entryKey={entryKey} location={path} navigator={navigator}>
                    <TabRoutes />
                </IsolatedTabRouter>
            );
        });

    await show('/s/acme/chats/c1', 'e1');
    await show('/s/acme/chats/c2', 'e2');
    await show('/s/acme/chats/c3', 'e3');

    expect(routeRenders).toBe(3);
    expect(identities.navigate.size).toBe(1);
    expect(identities.setSearchParams.size).toBe(1);
    expect(identities.activate.size).toBe(1);
    expect(rowRenders).toBe(1);

    // The stable function still resolves against the tab's current location.
    await act(() => {
        latest?.navigate('../c9', { relative: 'path' });
        latest?.setSearchParams({ thread: 'm1' });
    });
    expect(pushes).toEqual(['/s/acme/chats/c9', '/s/acme/chats/c3?thread=m1']);

    await act(() => root?.unmount());
});
