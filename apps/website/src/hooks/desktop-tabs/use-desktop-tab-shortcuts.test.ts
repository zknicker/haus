import { describe, expect, test } from 'bun:test';
import type { BrowserShortcut } from '../browser/browser-shortcut-keys.ts';
import type { DesktopTabsState } from './desktop-tabs-model.ts';
import { app, run, split } from './desktop-tabs-test-fixtures.ts';
import { runTabShortcut } from './use-desktop-tab-shortcuts.ts';
import { tabInFocusedRow } from './use-desktop-tabs-controller.ts';

/** primary: inbox, a, b (b selected); secondary: tasks. */
function threeAndOne(): DesktopTabsState {
    return run(
        split(),
        { intent: 'newTab', kind: 'openInFocusedPane', location: app('a') },
        { intent: 'newTab', kind: 'openInFocusedPane', location: app('b') }
    );
}

function press(shortcut: BrowserShortcut, state: DesktopTabsState) {
    const calls: unknown[] = [];
    const handled = runTabShortcut(shortcut, {
        reopenClosed: () => calls.push('reopen'),
        selectInFocusedPane: (target) => calls.push(target),
        state,
    });
    return { calls, handled };
}

describe('tab shortcuts act on the focused pane', () => {
    test('⌘1–8 pick by position and ⌘9 picks the last tab', () => {
        const state = threeAndOne();
        expect(press('tab-2', state).calls).toEqual([{ index: 1 }]);
        expect(press('tab-9', state).calls).toEqual([{ index: 2 }]);
        const secondary = run(state, { kind: 'focusPane', pane: 'secondary' });
        expect(press('tab-9', secondary).calls).toEqual([{ index: 0 }]);
    });

    test('Control-Tab cycles with wrap; ⌘⇧T reopens; page keys pass through', () => {
        const state = threeAndOne();
        const row = state.primary?.tabIds ?? [];
        expect(tabInFocusedRow(state, { step: 1 })).toBe(row[0]);
        expect(tabInFocusedRow(state, { step: -1 })).toBe(row[1]);
        expect(tabInFocusedRow(state, { index: 7 })).toBeNull();
        expect(press('next-tab', state).calls).toEqual([{ step: 1 }]);
        expect(press('reopen-tab', state).calls).toEqual(['reopen']);
        expect(press('reload', state)).toEqual({ calls: [], handled: false });
    });
});
