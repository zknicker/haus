import { describe, expect, test } from 'bun:test';
import { newTabLocation, tabHistoryLimit } from './desktop-tabs-model.ts';
import { initialDesktopTabs } from './desktop-tabs-reducer.ts';
import { parseDesktopTabs, serializeDesktopTabs } from './desktop-tabs-storage.ts';
import { app, describeTabs, run, split, start, web } from './desktop-tabs-test-fixtures.ts';
import { readWindowTabs, writeWindowTabs } from './desktop-tabs-window-store.ts';

const ids = { entryKey: 'fe', tabId: 'ft' };
const inbox = app('inbox');
const fallback = initialDesktopTabs(inbox, ids);
const parse = (raw: string | null) => parseDesktopTabs(raw, inbox, ids);

describe('desktop tabs storage', () => {
    test('round-trips panes, focus, histories, and page state; drops closed', () => {
        const state = run(
            split(),
            { fromTabId: 't0', intent: 'auto', kind: 'openLink', location: web('v1') },
            { kind: 'navigate', location: app('chats/a'), mode: 'push', tabId: 't0' },
            { kind: 'savePageState', pageState: { scrollTop: 12 }, tabId: 't0' },
            { kind: 'focusPane', pane: 'secondary' },
            { kind: 'close', tabIds: ['t1'] }
        );
        const parsed = parse(serializeDesktopTabs(state));
        expect(parsed).toEqual({ ...state, closed: [] });
        expect(describeTabs(parsed)).toEqual({
            focused: 'secondary',
            primary: 'chats/a*',
            secondary: 'web:v1*',
        });
    });

    test('a new tab page persists, history and all', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: newTabLocation },
            { kind: 'focusPane', pane: 'primary' }
        );
        const tabId = state.primary?.selectedTabId ?? '';
        const visited = run(state, {
            kind: 'navigate',
            location: web('v1'),
            mode: 'push',
            tabId,
        });
        const parsed = parse(serializeDesktopTabs(visited));
        expect(parsed.tabs[tabId]?.history.entries.map((entry) => entry.location)).toEqual([
            newTabLocation,
            web('v1'),
        ]);
    });

    test('bounds histories on write and read', () => {
        const pushes = Array.from({ length: tabHistoryLimit + 10 }, (_, index) => ({
            kind: 'navigate' as const,
            location: app(`p${index}`),
            mode: 'push' as const,
            tabId: 't0',
        }));
        const state = run(split(), ...pushes);
        const raw = JSON.parse(serializeDesktopTabs(state));
        raw.tabs.t0.history.entries = [
            ...raw.tabs.t0.history.entries,
            ...raw.tabs.t0.history.entries,
        ];
        const history = parse(JSON.stringify(raw)).tabs.t0?.history;
        expect(history?.entries).toHaveLength(tabHistoryLimit);
        expect(history?.index).toBeLessThan(tabHistoryLimit);
    });

    test('ignores an older window layout field', () => {
        const raw = JSON.parse(serializeDesktopTabs(split()));
        const legacy = { ...raw, expandedSelectedId: 't1', layout: 'expanded' };
        expect(parse(JSON.stringify(legacy))).toEqual(parse(JSON.stringify(raw)));
    });

    test('drops malformed tabs and repairs panes', () => {
        const raw = JSON.parse(serializeDesktopTabs(split()));
        raw.tabs.t0.history.entries[0].location = { kind: 'app', path: 'no-slash' };
        raw.secondary.selectedTabId = 'gone';
        raw.secondary.tabIds = ['t1', 't1', 'gone', '__proto__'];
        const parsed = parse(JSON.stringify(raw));
        expect(describeTabs(parsed)).toEqual({
            focused: 'primary',
            primary: 'tasks*',
            secondary: '-',
        });
        expect(Object.keys(parsed.tabs)).toEqual(['t1']);
    });

    test.each([
        ['nothing', null],
        ['garbage', '{not json'],
        ['an array', '[]'],
        ['another version', JSON.stringify({ tabs: {}, version: 0 })],
        [
            'no tabs left',
            JSON.stringify({
                primary: { selectedTabId: 'x', tabIds: ['x'] },
                tabs: {},
                version: 1,
            }),
        ],
        [
            'the legacy haus.workspaceTabs shape',
            JSON.stringify({
                agents: [],
                artifacts: [],
                files: [{ chatId: 'c1' }],
                order: [{ kind: 'primary' }, { chatId: 'c1', kind: 'files' }],
                threads: [],
            }),
        ],
        ['the legacy pre-thread shape', JSON.stringify({ artifacts: [], order: [] })],
    ])('%s parses to one Inbox tab', (_label, raw) => {
        expect(parse(raw)).toEqual(fallback);
    });
});

describe('window store', () => {
    const store = () => {
        const map = new Map<string, string>();
        return {
            getItem: (key: string) => map.get(key) ?? null,
            setItem: (key: string, value: string) => void map.set(key, value),
        };
    };
    const read = (s: ReturnType<typeof store>, seed: ReturnType<typeof app> | null = null) =>
        readWindowTabs({ home: inbox, ids, seed, serverId: 'srv', store: s });

    test('a window reads its own tabs, else its seed route, else one Inbox tab', () => {
        const s = store();
        writeWindowTabs(s, 'srv', split());
        expect(describeTabs(read(s, app('chats/a'))).secondary).toBe('tasks*');
        // A new window never inherits another window's tabs.
        expect(describeTabs(read(store(), app('chats/a')))).toMatchObject({ primary: 'chats/a*' });
        expect(read(store())).toEqual(fallback);
    });

    test('a closing window writes nothing', () => {
        const s = store();
        writeWindowTabs(
            s,
            'srv',
            run(split(), { kind: 'close', tabIds: ['t1'] }, { kind: 'close', tabIds: ['t0'] })
        );
        expect(read(s)).toEqual(fallback);
    });
});
