import { renderToStaticMarkup } from 'react-dom/server';
import {
    createMemoryRouter,
    Outlet,
    RouterProvider,
    useLocation,
    useParams,
    useRoutes,
} from 'react-router-dom';
import { expect, test } from 'vitest';
import { tabIntentState } from '../../hooks/desktop-tabs/tab-navigation.ts';
import {
    type OpenGesture,
    type OpenGestureEvent,
    openIntentFromEvent,
} from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { createTabNavigator, IsolatedTabRouter } from './tab-router.tsx';

const noopNavigator = {
    createHref: () => '#',
    go: () => undefined,
    push: () => undefined,
    replace: () => undefined,
};

function TabPage() {
    const location = useLocation();
    const { chatId = '', slug = '' } = useParams();
    return <span>{`${slug}|${chatId}|${location.pathname}${location.search}`}</span>;
}

function TabRoutes() {
    return useRoutes([{ path: 's/:slug/chats/:chatId', element: <TabPage /> }]);
}

// Guards the React Router internals the adapter resets: a router upgrade that
// breaks nesting fails here, not in the desktop shell.
test('a tab router nests inside the window data router with its own location and params', () => {
    const router = createMemoryRouter(
        [
            {
                path: 's/:slug/*',
                element: (
                    <>
                        <IsolatedTabRouter
                            entryKey="e1"
                            location="/s/acme/chats/c1?thread=m1"
                            navigator={noopNavigator}
                        >
                            <TabRoutes />
                        </IsolatedTabRouter>
                        <IsolatedTabRouter
                            entryKey="e2"
                            location="/s/acme/chats/c2"
                            navigator={noopNavigator}
                        >
                            <TabRoutes />
                        </IsolatedTabRouter>
                        <Outlet />
                    </>
                ),
            },
        ],
        { initialEntries: ['/s/acme/inbox'] }
    );

    const markup = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(markup).toContain('acme|c1|/s/acme/chats/c1?thread=m1');
    expect(markup).toContain('acme|c2|/s/acme/chats/c2');
});

function recordingNavigator(
    policy: 'page' | 'shell',
    from = '/s/acme/chats/c1',
    gesture: () => OpenGesture = () => 'auto'
) {
    const calls: unknown[][] = [];
    const navigator = createTabNavigator({
        current: () => ({ kind: 'app', path: from }),
        gesture,
        policy,
        serverPath: '/s/acme',
        tabId: 't1',
        tabs: {
            go: (...args) => calls.push(['go', ...args]),
            goTo: (...args) => calls.push(['goTo', ...args]),
            navigate: (...args) => calls.push(['navigate', ...args]),
            open: (...args) => calls.push(['open', ...args]),
            openTab: (...args) => calls.push(['openTab', ...args]),
        },
        windowNavigate: (...args) => calls.push(['window', ...args]),
    });
    return { calls, navigator };
}

const at = (path: string) => ({ kind: 'app', path });

test('a page push to its own page stays in the tab; another page is Open from the tab', () => {
    const { calls, navigator } = recordingNavigator('page');
    navigator.push('/s/acme/chats/c1?thread=m1');
    navigator.push('/s/acme/inbox');
    navigator.replace('/s/acme/settings/profile');
    expect(calls).toEqual([
        ['navigate', 't1', at('/s/acme/chats/c1?thread=m1'), 'push'],
        ['open', 't1', at('/s/acme/inbox')],
        ['navigate', 't1', at('/s/acme/settings/profile'), 'replace'],
    ]);
});

test('window chrome is always Go, whatever page the focused tab it reads shows', () => {
    // The focused right tab shows #x; a sidebar click on #x navigates the left pane to #x.
    const { calls, navigator } = recordingNavigator('shell', '/s/acme/chats/x');
    navigator.push('/s/acme/chats/x');
    navigator.push('/s/acme/chats/c2');
    expect(calls).toEqual([
        ['goTo', at('/s/acme/chats/x')],
        ['goTo', at('/s/acme/chats/c2')],
    ]);
});

test('a gesture stated in router state (read before an await) wins over the in-flight click', () => {
    const page = recordingNavigator('page', '/s/acme/chats/c1', () => 'auto');
    page.navigator.push('/s/acme/chats/c2', tabIntentState('backgroundTab'));
    const shell = recordingNavigator('shell', '/s/acme/inbox', () => 'backgroundTab');
    shell.navigator.push('/s/acme/tasks', tabIntentState('auto'));
    expect(page.calls).toEqual([['openTab', 't1', at('/s/acme/chats/c2'), { background: true }]]);
    expect(shell.calls).toEqual([['goTo', at('/s/acme/tasks')]]);
});

test('a push takes the in-flight click gesture; a replace does not', () => {
    // A chip's press handler pushes: Command- or middle-click opens it in the background.
    const page = recordingNavigator('page', '/s/acme/chats/c1', () => 'backgroundTab');
    page.navigator.push('/s/acme/inbox');
    page.navigator.replace('/s/acme/chats/c1?thread=m1');
    const shift = recordingNavigator('page', '/s/acme/chats/c1', () => 'newTab');
    shift.navigator.push('/s/acme/tasks');
    expect(page.calls).toEqual([
        ['openTab', 't1', at('/s/acme/inbox'), { background: true }],
        ['navigate', 't1', at('/s/acme/chats/c1?thread=m1'), 'replace'],
    ]);
    expect(shift.calls).toEqual([['openTab', 't1', at('/s/acme/tasks'), { background: false }]]);
});

test('a sidebar row or command menu item: Command-click and Command-Return open a background tab beside the left pane’s tab', () => {
    const modifier = /Mac/u.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    const event = (init: Partial<OpenGestureEvent>) => () =>
        openIntentFromEvent({ ctrlKey: false, metaKey: false, type: 'click', ...init });
    const runs = [
        recordingNavigator('shell', '/s/acme/inbox', event({})),
        recordingNavigator('shell', '/s/acme/inbox', event(modifier)),
        recordingNavigator('shell', '/s/acme/inbox', event({ ...modifier, type: 'keydown' })),
        recordingNavigator('shell', '/s/acme/inbox', event({ ...modifier, shiftKey: true })),
    ];
    for (const { navigator: nav } of runs) {
        nav.push('/s/acme/chats/c1');
    }
    const chat = at('/s/acme/chats/c1');
    expect(runs.map((entry) => entry.calls)).toEqual([
        [['goTo', chat]],
        [['openTab', null, chat, { background: true }]],
        [['openTab', null, chat, { background: true }]],
        [['openTab', null, chat, { background: false }]],
    ]);
});

test('paths outside the Server leave the tab for the window router', () => {
    const { calls, navigator } = recordingNavigator('page');
    navigator.push('/s/other/inbox');
    navigator.replace('/s');
    navigator.go(-1);
    expect(calls).toEqual([
        ['window', '/s/other/inbox', { replace: false }],
        ['window', '/s', { replace: true }],
        ['go', 't1', -1],
    ]);
});
