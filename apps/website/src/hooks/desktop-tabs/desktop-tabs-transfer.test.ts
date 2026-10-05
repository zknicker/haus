import { expect, test } from 'bun:test';
import type { DesktopTab, TabBundle } from './desktop-tabs-model.ts';
import { parseTabBundle } from './desktop-tabs-storage.ts';
import { app, describeTabs, run, split, start, web } from './desktop-tabs-test-fixtures.ts';
import { bundleOf, windowOfTabs } from './desktop-tabs-transfer.ts';

const arriving: DesktopTab = {
    history: {
        entries: [
            { key: 'k1', location: app('chats/c1'), pageState: { scrollTop: 40 } },
            { key: 'k2', location: web('v1'), pageState: {} },
        ],
        index: 1,
    },
    id: 'moved',
};
const second: DesktopTab = {
    history: { entries: [{ key: 'k3', location: web('v2'), pageState: {} }], index: 0 },
    id: 'second',
};
const one: TabBundle = { activeTabId: 'moved', tabs: [arriving] };
const pair: TabBundle = { activeTabId: 'second', tabs: [arriving, second] };

test('a tab from another window lands at its slot with its history, selected and focused', () => {
    const state = run(split(), { bundle: one, kind: 'adopt', to: { index: 0, pane: 'secondary' } });
    expect(describeTabs(state)).toEqual({
        focused: 'secondary',
        primary: 'inbox*',
        secondary: 'web:v1* tasks',
    });
    expect(state.tabs.moved?.history).toEqual(arriving.history);
    // An id already here is never clobbered.
    expect(run(state, { bundle: one, kind: 'adopt', to: { index: 0, pane: 'primary' } })).toBe(
        state
    );
});

test('tabs arriving together land side by side, selected together, showing the active one', () => {
    const state = run(split(), {
        bundle: pair,
        kind: 'adopt',
        to: { index: 1, pane: 'secondary' },
    });
    expect(describeTabs(state)).toEqual({
        focused: 'secondary',
        primary: 'inbox*',
        secondary: 'tasks web:v1 web:v2*',
    });
    expect(state.secondary?.selection).toEqual({
        anchorTabId: 'second',
        tabIds: ['moved', 'second'],
    });
});

test('tabs leaving for another window take no closed-tab records', () => {
    const state = run(split(), { kind: 'release', tabIds: ['t1'] });
    expect(describeTabs(state)).toEqual({ focused: 'primary', primary: 'inbox*', secondary: '-' });
    expect(state.tabs.t1).toBeUndefined();
    expect(state.closed).toEqual([]);
    expect(run(state, { kind: 'reopenClosed' })).toBe(state);
});

test('a torn-off window starts as one pane holding its tabs, still selected together', () => {
    expect(describeTabs(windowOfTabs(one))).toEqual({
        focused: 'primary',
        primary: 'web:v1*',
        secondary: '-',
    });
    const torn = windowOfTabs(pair);
    expect(describeTabs(torn).primary).toBe('web:v1 web:v2*');
    expect(torn.primary?.selection?.tabIds).toEqual(['moved', 'second']);
});

test('a drag bundles its tabs in row order, showing the row shown tab', () => {
    const state = run(
        start(),
        { intent: 'newTab', kind: 'openInFocusedPane', location: app('a'), newId: 'ta' },
        { gesture: 'toggle', kind: 'extendSelection', tabId: 't0' }
    );
    const bundle = bundleOf(state, ['t0', 'ta']);
    expect(bundle?.activeTabId).toBe('t0');
    expect(bundle?.tabs.map((tab) => tab.id)).toEqual(['t0', 'ta']);
});

test('a bundle from another window parses only whole and consistent', () => {
    expect(parseTabBundle(JSON.parse(JSON.stringify(pair)))).toEqual(pair);
    expect(parseTabBundle({ ...pair, activeTabId: 'nope' })).toBeNull();
    expect(parseTabBundle({ activeTabId: 'moved', tabs: [arriving, arriving] })).toBeNull();
    expect(parseTabBundle({ activeTabId: 'moved', tabs: [arriving, { id: 'x' }] })).toBeNull();
    expect(parseTabBundle({ activeTabId: 'moved', tabs: [] })).toBeNull();
});
