import { currentLocation, type DesktopTabsState, type TabLocation } from './desktop-tabs-model.ts';
import {
    type DesktopTabsAction,
    desktopTabsReducer,
    initialDesktopTabs,
} from './desktop-tabs-reducer.ts';

/** Test fixtures for the desktop tabs reducer: readable paths and sequential ids. */
export function app(page: string): TabLocation {
    return { kind: 'app', path: `/s/acme/${page}` };
}

export function web(viewId: string, url = `https://${viewId}.example`): TabLocation {
    return { kind: 'browser', title: viewId, url, viewId };
}

export function start(page = 'inbox'): DesktopTabsState {
    return initialDesktopTabs(app(page), { entryKey: 'e0', tabId: 't0' });
}

let counter = 0;

/** Applies actions in order; `newId` is filled with a fresh sequential id when absent. */
export function run(
    state: DesktopTabsState,
    ...actions: (DesktopTabsAction | WithoutId<DesktopTabsAction>)[]
): DesktopTabsState {
    return actions.reduce<DesktopTabsState>((current, action) => {
        counter += 1;
        const full = (
            'newId' in action ? action : { ...action, newId: `n${counter}` }
        ) as DesktopTabsAction;
        return desktopTabsReducer(current, full);
    }, state);
}

/**
 * Splits into `primary: [inbox]`, `secondary: [tasks]`, primary focused: a
 * new tab moved to the right pane (links never open the second pane).
 */
export function split(): DesktopTabsState {
    return run(
        start(),
        { intent: 'newTab', kind: 'openInFocusedPane', location: app('tasks'), newId: 't1' },
        { kind: 'move', tabIds: ['t1'], to: { index: 0, pane: 'secondary' } },
        { kind: 'focusPane', pane: 'primary' }
    );
}

/** `pane: path, path*` per pane, `*` marking the selection; for compact assertions. */
export function describeTabs(state: DesktopTabsState): Record<string, string> {
    const row = (pane: 'primary' | 'secondary') => {
        const value = state[pane];
        if (!value) {
            return '-';
        }
        return value.tabIds
            .map((id) => {
                const tab = state.tabs[id];
                const location = tab ? currentLocation(tab) : null;
                const label = locationLabel(location);
                return `${label}${value.selectedTabId === id ? '*' : ''}`;
            })
            .join(' ');
    };
    return { focused: state.focusedPane, primary: row('primary'), secondary: row('secondary') };
}

function locationLabel(location: TabLocation | null) {
    switch (location?.kind) {
        case 'app':
            return location.path.replace('/s/acme/', '');
        case 'browser':
            return `web:${location.viewId}`;
        default:
            return 'newTab';
    }
}

type WithoutId<T> = T extends { newId: string } ? Omit<T, 'newId'> : never;
