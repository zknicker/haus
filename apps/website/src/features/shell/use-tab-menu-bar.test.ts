import { expect, test } from 'bun:test';
import {
    app,
    run,
    split,
    start,
    web,
} from '../../hooks/desktop-tabs/desktop-tabs-test-fixtures.ts';
import { runMenuCommand, tabMenuState } from './use-tab-menu-bar.ts';

test('a one-tab window can only duplicate', () => {
    expect(tabMenuState(start())).toEqual({
        duplicate: true,
        moveToNewWindow: false,
        moveToOtherPane: false,
        selectOther: false,
    });
});

test('a split window can move the focused tab anywhere but has nothing to cycle in a one-tab pane', () => {
    expect(tabMenuState(split())).toEqual({
        duplicate: true,
        moveToNewWindow: true,
        moveToOtherPane: true,
        selectOther: false,
    });
});

test('a selection of every tab in a one-pane window has nowhere to move', () => {
    const state = run(
        start(),
        { intent: 'newTabAtEnd', kind: 'openInFocusedPane', location: app('a'), newId: 'a' },
        { gesture: 'toggle', kind: 'extendSelection', tabId: 't0' }
    );
    expect(tabMenuState(state)).toMatchObject({
        moveToNewWindow: false,
        moveToOtherPane: false,
        selectOther: true,
    });
});

function fakeTabs(state = split()) {
    const calls: unknown[][] = [];
    return {
        calls,
        tabs: {
            duplicate: (ids: readonly string[]) => calls.push(['duplicate', ids]),
            move: (ids: readonly string[], to: unknown) => calls.push(['move', ids, to]),
            moveToNewWindow: (ids: readonly string[]) => calls.push(['new-window', ids]),
            state,
        },
    };
}

test('forwarded Tab menu commands act on the focused pane’s tabs', () => {
    const { calls, tabs } = fakeTabs();
    const refetch = () => calls.push(['refetch']);
    runMenuCommand('duplicate-tab', tabs, refetch);
    runMenuCommand('move-tab-to-new-window', tabs, refetch);
    runMenuCommand('move-tab-to-other-pane', tabs, refetch);
    expect(calls).toEqual([
        ['duplicate', ['t0']],
        ['new-window', ['t0']],
        ['move', ['t0'], { index: 1, pane: 'secondary' }],
    ]);
});

test('Reload Page refetches an App page and leaves web pages and the new tab page alone', () => {
    const appTab = fakeTabs(start());
    runMenuCommand('reload', appTab.tabs, () => appTab.calls.push(['refetch']));
    expect(appTab.calls).toEqual([['refetch']]);

    const webState = run(start(), {
        fromTabId: 't0',
        intent: 'auto',
        kind: 'openLink',
        location: web('v1'),
        newId: 'w',
    });
    const webTab = fakeTabs(run(webState, { kind: 'select', tabId: 'w' }));
    runMenuCommand('reload', webTab.tabs, () => webTab.calls.push(['refetch']));
    expect(webTab.calls).toEqual([]);
});
