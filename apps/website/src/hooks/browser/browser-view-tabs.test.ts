import { expect, test } from 'bun:test';
import type {
    DesktopTab,
    DesktopTabsState,
    TabLocation,
} from '../desktop-tabs/desktop-tabs-model.ts';
import {
    browserOpenGesture,
    focusedTabId,
    focusedViewId,
    newBrowserLocation,
    referencedViewIds,
    tabShowingView,
} from './browser-view-tabs.ts';

const web = (viewId: string): TabLocation => ({
    kind: 'browser',
    title: viewId,
    url: `https://${viewId}.example/`,
    viewId,
});
const chat: TabLocation = { kind: 'app', path: '/s/haus/chats/general' };

function tab(id: string, locations: TabLocation[], index = locations.length - 1): DesktopTab {
    return {
        id,
        history: {
            entries: locations.map((location, key) => ({
                key: `${id}-${key}`,
                location,
                pageState: {},
            })),
            index,
        },
    };
}

const state: DesktopTabsState = {
    closed: [{ index: 0, pane: 'primary', tab: tab('closed', [web('gone')]) }],
    focusedPane: 'secondary',
    mru: ['docs', 'chat'],
    primary: { selectedTabId: 'chat', tabIds: ['chat'] },
    secondary: { selectedTabId: 'docs', tabIds: ['docs'] },
    tabs: {
        // Went back from a web page to the chat: the page's view stays referenced for Forward.
        chat: tab('chat', [chat, web('forward')], 0),
        docs: tab('docs', [web('docs')]),
    },
};

test('views map to the tab currently showing them, and only open histories keep views', () => {
    expect(tabShowingView(state, 'docs')).toBe('docs');
    expect(tabShowingView(state, 'forward')).toBeNull();
    expect(referencedViewIds(state)).toEqual(new Set(['forward', 'docs']));
});

test('the focused pane’s web page takes page actions', () => {
    expect(focusedTabId(state)).toBe('docs');
    expect(focusedViewId(state)).toBe('docs');
    expect(focusedViewId({ ...state, focusedPane: 'primary' })).toBeNull();
});

test('a new web location gets its own view and a host title', () => {
    const url = 'https://docs.example/a?response_type=code&scope=read%2Cwrite#section';
    const location = newBrowserLocation(url);
    expect(location).toMatchObject({ kind: 'browser', title: 'docs.example', url });
    expect(location.viewId).not.toBe(newBrowserLocation('https://docs.example/a').viewId);
    // A popup's tab shows the live view Electron opened for it.
    expect(newBrowserLocation(url, 'popup-1').viewId).toBe('popup-1');
});

test("a page's open request: background beside the page, else a plain Open on the right", () => {
    const request = { background: true, openerId: 'v1', url: 'https://example.com/', viewId: null };
    // ⌘- or middle-click in a page, and the page menu's Open Link in New Tab.
    expect(browserOpenGesture(request)).toBe('backgroundTab');
    // target=_blank and a popup: Open, a selected tab in the right pane.
    expect(browserOpenGesture({ ...request, background: false })).toBe('auto');
});
