import { expect, test } from 'bun:test';
import type { DesktopTabsAction } from '../../hooks/desktop-tabs/desktop-tabs-reducer.ts';
import {
    app,
    describeTabs,
    run,
    split,
} from '../../hooks/desktop-tabs/desktop-tabs-test-fixtures.ts';
import { settingsRailNavigate } from './settings-rail-router.tsx';

test('Settings open in the right pane: a rail section pushes in that tab and stays there', () => {
    // Settings on the right, focused, so chrome (and its rail) reads that tab.
    const base = run(
        split(),
        { fromTabId: 't0', kind: 'open', location: app('settings/profile'), newId: 's' },
        { kind: 'focusPane', pane: 'secondary' }
    );
    const actions: DesktopTabsAction[] = [];
    settingsRailNavigate(
        {
            navigate: (tabId, location, mode) =>
                actions.push({ kind: 'navigate', location, mode, newId: 'e1', tabId }),
        },
        's'
    )('/s/acme/settings/members');
    const state = run(base, ...actions);
    expect(describeTabs(state)).toEqual({
        focused: 'secondary',
        primary: 'inbox*',
        secondary: 'tasks settings/members*',
    });
    expect(state.tabs.s?.history.entries).toHaveLength(2);
});
