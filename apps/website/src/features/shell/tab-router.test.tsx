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
import { tabIntentStateKey } from '../../hooks/desktop-tabs/tab-navigation.ts';
import {
    type OpenGesture,
    type OpenGestureEvent,
    openIntentFromEvent,
} from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { createTabNavigator, IsolatedTabRouter } from './tab-router.tsx';
import { newTabLink, openNewTabLink } from './use-desktop-tab-window.ts';

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
            navigate: (...args) => calls.push(['navigate', ...args]),
            openInFocusedPane: (...args) => calls.push(['openInFocusedPane', ...args]),
            openLink: (...args) => calls.push(['openLink', ...args]),
        },
        windowNavigate: (...args) => calls.push(['window', ...args]),
    });
    return { calls, navigator };
}

test('a page push to its own page stays in the tab; another page is a link', () => {
    const { calls, navigator } = recordingNavigator('page');
    navigator.push('/s/acme/chats/c1?thread=m1');
    navigator.push('/s/acme/inbox');
    navigator.replace('/s/acme/settings/profile');
    expect(calls).toEqual([
        ['navigate', 't1', { kind: 'app', path: '/s/acme/chats/c1?thread=m1' }, 'push'],
        ['openLink', 't1', { kind: 'app', path: '/s/acme/inbox' }, 'auto'],
        ['navigate', 't1', { kind: 'app', path: '/s/acme/settings/profile' }, 'replace'],
    ]);
});

test('Command-click intent opens a new tab from a page and from window chrome', () => {
    const state = { [tabIntentStateKey]: 'newTab' };
    const page = recordingNavigator('page');
    page.navigator.push('/s/acme/chats/c1', state);
    const shell = recordingNavigator('shell');
    shell.navigator.push('/s/acme/tasks', state);
    shell.navigator.push('/s/acme/inbox');
    expect(page.calls).toEqual([
        ['openLink', 't1', { kind: 'app', path: '/s/acme/chats/c1' }, 'newTab'],
    ]);
    expect(shell.calls).toEqual([
        ['openInFocusedPane', { kind: 'app', path: '/s/acme/tasks' }, 'newTab'],
        ['openInFocusedPane', { kind: 'app', path: '/s/acme/inbox' }, 'current'],
    ]);
});

test('a push takes the in-flight click gesture; a replace and a stated intent do not', () => {
    // A chip's press handler pushes: Command- or middle-click opens it in the background from a page.
    const page = recordingNavigator('page', '/s/acme/chats/c1', () => 'backgroundTab');
    page.navigator.push('/s/acme/inbox');
    page.navigator.replace('/s/acme/chats/c1?thread=m1');
    page.navigator.push('/s/acme/agents/a', { [tabIntentStateKey]: 'here' });
    const shift = recordingNavigator('page', '/s/acme/chats/c1', () => 'newTab');
    shift.navigator.push('/s/acme/tasks');
    const shell = recordingNavigator('shell', '/s/acme/inbox', () => 'backgroundTab');
    shell.navigator.push('/s/acme/tasks');
    expect(page.calls).toEqual([
        ['openLink', 't1', { kind: 'app', path: '/s/acme/inbox' }, 'backgroundTab'],
        ['navigate', 't1', { kind: 'app', path: '/s/acme/chats/c1?thread=m1' }, 'replace'],
        ['navigate', 't1', { kind: 'app', path: '/s/acme/agents/a' }, 'push'],
    ]);
    expect(shift.calls).toEqual([
        ['openLink', 't1', { kind: 'app', path: '/s/acme/tasks' }, 'newTab'],
    ]);
    // Window chrome keeps the gesture too.
    expect(shell.calls).toEqual([
        ['openInFocusedPane', { kind: 'app', path: '/s/acme/tasks' }, 'backgroundTab'],
    ]);
});

test('a command menu result: Command-click opens a background tab, Command-Shift-click a selected one', () => {
    // The command menu runs in the shell router; its item's press reads the in-flight click.
    const modifier = /Mac/u.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    const click = (init: Partial<OpenGestureEvent>) => () =>
        openIntentFromEvent({ ctrlKey: false, metaKey: false, type: 'click', ...init });
    const plain = recordingNavigator('shell', '/s/acme/inbox', click({}));
    const command = recordingNavigator('shell', '/s/acme/inbox', click(modifier));
    const commandShift = recordingNavigator(
        'shell',
        '/s/acme/inbox',
        click({ ...modifier, shiftKey: true })
    );
    for (const { navigator: nav } of [plain, command, commandShift]) {
        nav.push('/s/acme/chats/c1');
    }
    const chat = { kind: 'app', path: '/s/acme/chats/c1' };
    expect(plain.calls).toEqual([['openInFocusedPane', chat, 'current']]);
    expect(command.calls).toEqual([['openInFocusedPane', chat, 'backgroundTab']]);
    expect(commandShift.calls).toEqual([['openInFocusedPane', chat, 'newTab']]);
});

test('a sidebar row: Command- and middle-click open a background tab; Shift and Command-Shift a selected one', () => {
    // React Aria re-dispatches a modified left click on a row as a synthetic anchor click
    // outside every tab; a middle click lands on the row's `data-href`.
    const target = (attribute: 'data-href' | 'href') => ({
        closest: (selector: string) =>
            attribute === 'href' || selector.includes('[data-href]')
                ? {
                      getAttribute: (name: string) =>
                          name === attribute ? '#/s/acme/chats/c1' : null,
                  }
                : null,
    });
    const event = (init: Partial<MouseEvent>, attribute: 'data-href' | 'href' = 'href') =>
        ({
            button: 0,
            ctrlKey: false,
            defaultPrevented: false,
            metaKey: false,
            shiftKey: false,
            target: target(attribute),
            type: 'click',
            ...init,
        }) as unknown as MouseEvent;
    const modifier = /Mac/u.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    const gestures = [
        event(modifier),
        event({ button: 1, type: 'auxclick' }, 'data-href'),
        event({ shiftKey: true }),
        event({ ...modifier, shiftKey: true }),
    ];
    const calls: unknown[][] = [];
    const tabs = {
        openInFocusedPane: (...args: unknown[]) => calls.push(['openInFocusedPane', ...args]),
        openLink: (...args: unknown[]) => calls.push(['openLink', ...args]),
    };
    for (const gesture of gestures) {
        const link = newTabLink(gesture, '/s/acme');
        if (link) {
            openNewTabLink(tabs, link, undefined);
        }
    }
    const chat = { kind: 'app', path: '/s/acme/chats/c1' };
    expect(calls).toEqual([
        ['openInFocusedPane', chat, 'backgroundTab'],
        ['openInFocusedPane', chat, 'backgroundTab'],
        ['openInFocusedPane', chat, 'newTab'],
        ['openInFocusedPane', chat, 'newTab'],
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

test('Command- and middle-click on an in-Server link name a background tab; Shift a selected one', () => {
    const anchor = (href: string) => ({
        closest: () => ({ getAttribute: (name: string) => (name === 'href' ? href : null) }),
    });
    // A React Aria item: `data-href`, matched only when the selector asks for it.
    const item = (href: string) => ({
        closest: (selector: string) =>
            selector.includes('[data-href]')
                ? { getAttribute: (name: string) => (name === 'data-href' ? href : null) }
                : null,
    });
    const click = (init: Partial<MouseEvent>, target: unknown) =>
        ({
            button: 0,
            ctrlKey: false,
            defaultPrevented: false,
            metaKey: false,
            shiftKey: false,
            target,
            type: 'click',
            ...init,
        }) as unknown as MouseEvent;
    const modifier = /Mac/u.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    const inbox = { kind: 'app', path: '/s/acme/inbox' };
    const background = { intent: 'backgroundTab', location: inbox };
    const selected = { intent: 'newTab', location: inbox };
    expect(newTabLink(click(modifier, anchor('#/s/acme/chats/c2')), '/s/acme')).toEqual({
        intent: 'backgroundTab',
        location: { kind: 'app', path: '/s/acme/chats/c2' },
    });
    expect(
        newTabLink(click({ ...modifier, shiftKey: true }, anchor('/s/acme/inbox')), '/s/acme')
    ).toEqual(selected);
    expect(newTabLink(click({ shiftKey: true }, anchor('/s/acme/inbox')), '/s/acme')).toEqual(
        selected
    );
    expect(
        newTabLink(click({ button: 1, type: 'auxclick' }, anchor('/s/acme/inbox')), '/s/acme')
    ).toEqual(background);
    // Middle-click on a sidebar row (a `data-href` item) opens a tab; its left clicks are React Aria's.
    expect(
        newTabLink(click({ button: 1, type: 'auxclick' }, item('/s/acme/inbox')), '/s/acme')
    ).toEqual(background);
    expect(newTabLink(click(modifier, item('/s/acme/inbox')), '/s/acme')).toBeNull();
    expect(newTabLink(click({}, anchor('/s/acme/inbox')), '/s/acme')).toBeNull();
    expect(
        newTabLink(click({ button: 2, type: 'auxclick' }, anchor('/s/acme/inbox')), '/s/acme')
    ).toBeNull();
    expect(newTabLink(click(modifier, anchor('https://example.com')), '/s/acme')).toBeNull();
    expect(newTabLink(click(modifier, anchor('/s/other/inbox')), '/s/acme')).toBeNull();
});
