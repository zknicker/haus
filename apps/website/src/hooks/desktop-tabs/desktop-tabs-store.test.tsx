import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import {
    DesktopTabsContext,
    useDesktopTabCommands,
    useDesktopTabsSelector,
} from './desktop-tabs-context.ts';
import { currentEntry, type DesktopTabsState } from './desktop-tabs-model.ts';
import { createDesktopTabsStore } from './desktop-tabs-store.ts';
import { app, split } from './desktop-tabs-test-fixtures.ts';
import { createDesktopTabCommands } from './use-desktop-tabs-controller.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

describe('desktop tabs store', () => {
    test('saved page state re-renders nothing but persists, and the next dispatch publishes it', () => {
        const store = createDesktopTabsStore(split());
        let renders = 0;
        let writes = 0;
        store.subscribe(() => {
            renders += 1;
        });
        store.subscribeLatest(() => {
            writes += 1;
        });
        const before = store.snapshot();

        store.savePageState('t0', { scrollTop: 120 });

        expect(renders).toBe(0);
        expect(writes).toBe(1);
        expect(store.snapshot()).toBe(before);
        expect(pageState(store.latest(), 't0')).toEqual({ scrollTop: 120 });

        // A no-op dispatch (selecting the shown tab) still publishes it.
        store.dispatch({ kind: 'select', tabId: 't0' });
        expect(renders).toBe(1);
        expect(pageState(store.snapshot(), 't0')).toEqual({ scrollTop: 120 });
    });

    test('a closed tab reopens with page state saved after the last dispatch', () => {
        const store = createDesktopTabsStore(split());
        const commands = createDesktopTabCommands(store, { route: '/', serverId: 'server' });
        commands.savePageState('t1', { scrollTop: 40 });
        commands.close(['t1']);
        commands.reopenClosed();
        const reopened = Object.values(store.snapshot().tabs).find(
            (tab) => currentEntry(tab).location.kind === 'app' && tab.id !== 't0'
        );
        expect(reopened ? currentEntry(reopened).pageState : null).toEqual({ scrollTop: 40 });
    });
});

/** Stands in for a tab frame: reads only its own entry, with a memoized page under it. */
const frameRenders: Record<string, number> = {};
const pageRenders: Record<string, number> = {};
let commandRenders = 0;

function Frame({ tabId }: { tabId: string }) {
    const entry = useDesktopTabsSelector((state) => {
        const tab = state.tabs[tabId];
        return tab ? currentEntry(tab) : null;
    });
    frameRenders[tabId] = (frameRenders[tabId] ?? 0) + 1;
    return entry ? <Page entryKey={entry.key} tabId={tabId} /> : null;
}

const Page = React.memo(function Page({ tabId }: { entryKey: string; tabId: string }) {
    pageRenders[tabId] = (pageRenders[tabId] ?? 0) + 1;
    return null;
});

function CommandReader() {
    useDesktopTabCommands();
    commandRenders += 1;
    return null;
}

test('navigating one tab or saving page state never re-renders another tab page', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const store = createDesktopTabsStore(split());
    const commands = createDesktopTabCommands(store, { route: '/', serverId: 'server' });
    let root: Root | null = null;
    await act(() => {
        root = createRoot(document.createElement('div'));
        root.render(
            <DesktopTabsContext value={commands}>
                <CommandReader />
                <Frame tabId="t0" />
                <Frame tabId="t1" />
            </DesktopTabsContext>
        );
    });
    expect(pageRenders).toEqual({ t0: 1, t1: 1 });

    await act(() => commands.navigate('t0', app('channels'), 'push'));
    expect(frameRenders).toEqual({ t0: 2, t1: 1 });
    expect(pageRenders).toEqual({ t0: 2, t1: 1 });

    await act(() => commands.savePageState('t1', { scrollTop: 300 }));
    expect(frameRenders).toEqual({ t0: 2, t1: 1 });

    // The next dispatch publishes t1's new entry: its frame re-reads it, its page stays.
    await act(() => commands.focusPane('secondary'));
    expect(frameRenders).toEqual({ t0: 2, t1: 2 });
    expect(pageRenders).toEqual({ t0: 2, t1: 1 });
    expect(commandRenders).toBe(1);
    await act(() => root?.unmount());
});

function pageState(state: DesktopTabsState, tabId: string) {
    const tab = state.tabs[tabId];
    return tab ? currentEntry(tab).pageState : null;
}
