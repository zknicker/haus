import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import {
    type DesktopTabsApi,
    DesktopTabsContext,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { DesktopTabsState } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { desktopTabsReducer } from '../../hooks/desktop-tabs/desktop-tabs-reducer.ts';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { DesktopTabLayer } from './desktop-tab-layer.tsx';
import type { TabFramePlacement } from './desktop-tab-placement.ts';
import { createTabDragView, TabDragViewContext } from './tab-drag/tab-drag-view.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

/** Counts its mounts and holds local state, standing in for a tab's page. */
const mounts: Record<string, number> = {};
const bump: Record<string, () => void> = {};
const seen: Record<string, { count: number; placement: TabFramePlacement }> = {};

function Page({ placement, tabId }: { placement: TabFramePlacement; tabId: string }) {
    const [count, setCount] = React.useState(() => {
        mounts[tabId] = (mounts[tabId] ?? 0) + 1;
        return 0;
    });
    bump[tabId] = () => setCount((value) => value + 1);
    seen[tabId] = { count, placement };
    return null;
}

const renderTab = (tabId: string, placement: TabFramePlacement) => (
    <Page placement={placement} tabId={tabId} />
);

function api(state: DesktopTabsState): DesktopTabsApi {
    const noop = () => undefined;
    const shown = [state.primary?.selectedTabId, state.secondary?.selectedTabId].filter(
        (id): id is string => id !== undefined
    );
    return {
        adopt: noop,
        close: noop,
        duplicate: noop,
        extendSelection: noop,
        focusPane: noop,
        go: noop,
        mountedTabIds: shown,
        move: noop,
        moveToNewWindow: noop,
        navigate: noop,
        openAfter: noop,
        openInFocusedPane: noop,
        openLink: noop,
        release: noop,
        reopenClosed: noop,
        reveal: noop,
        savePageState: noop,
        select: noop,
        selectInFocusedPane: noop,
        serverId: 'server',
        shownTabIds: shown,
        state,
        tab: () => null,
    };
}

const initial: DesktopTabsState = {
    closed: [],
    focusedPane: 'primary',
    mru: [],
    primary: { selectedTabId: 'a', tabIds: ['a', 'b'] },
    secondary: { selectedTabId: 'd', tabIds: ['d'] },
    tabs: {},
};

test('moving a tab between panes keeps its frame mounted with its state', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const view = createTabDragView();
    const container = document.createElement('div');
    let root: Root | null = null;
    const render = (state: DesktopTabsState) =>
        root?.render(
            <DesktopTabsContext value={api(state)}>
                <TabDragViewContext value={view}>
                    <DesktopTabLayer renderTab={renderTab} />
                </TabDragViewContext>
            </DesktopTabsContext>
        );
    await act(() => {
        root = createRoot(container);
        render(initial);
    });
    await act(() => bump.a?.());
    expect(seen.a).toEqual({ count: 1, placement: expect.objectContaining({ pane: 'primary' }) });

    // Dragged into the right row: the frame previews there, still the same tree.
    await act(() =>
        view.set({ draggingIds: ['a'], slot: { index: 1, row: 'secondary' }, visiting: false })
    );
    expect(seen.a?.placement).toEqual({
        focusedPane: true,
        pane: 'secondary',
        shown: true,
        visible: true,
    });
    expect(seen.b?.placement.visible).toBe(true);

    // Dropped: the move commits and the view clears in one render.
    const moved = desktopTabsReducer(initial, {
        kind: 'move',
        tabIds: ['a'],
        to: { index: 1, pane: 'secondary' },
    });
    await act(() => {
        render(moved);
        view.set(null);
    });
    expect(seen.a).toEqual({
        count: 1,
        placement: { focusedPane: true, pane: 'secondary', shown: true, visible: true },
    });
    expect(mounts.a).toBe(1);
    expect(seen.b?.placement).toEqual(expect.objectContaining({ shown: true, visible: true }));
    await act(() => root?.unmount());
});
