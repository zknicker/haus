import { describe, expect, test } from 'bun:test';
import { app, run, split, web } from './desktop-tabs-test-fixtures.ts';
import { paneHistorySteps } from './use-pane-history.ts';

describe('paneHistorySteps', () => {
    test('each pane steps only its own shown tab', () => {
        // Left: inbox → chat → files (back to the chat). Right: tasks, no history.
        const state = run(
            split(),
            { kind: 'navigate', location: app('chats/c1'), mode: 'push', tabId: 't0' },
            { kind: 'navigate', location: app('artifacts'), mode: 'push', tabId: 't0' },
            { delta: -1, kind: 'go', tabId: 't0' }
        );
        expect(paneHistorySteps(state, 'primary', null)).toEqual({ back: true, forward: true });
        expect(paneHistorySteps(state, 'secondary', null)).toEqual({
            back: false,
            forward: false,
        });
    });

    test('follows the pane to the tab it switches to', () => {
        const state = run(
            split(),
            { kind: 'navigate', location: app('activity'), mode: 'push', tabId: 't1' },
            { kind: 'openNewTab', location: app('inbox') }
        );
        // ⌘T opened a fresh tab in the focused (left) pane; the right pane keeps its history.
        expect(paneHistorySteps(state, 'primary', null)).toEqual({ back: false, forward: false });
        expect(paneHistorySteps(state, 'secondary', null)).toEqual({ back: true, forward: false });
        const back = run(state, { kind: 'select', tabId: 't0' });
        expect(paneHistorySteps(back, 'primary', null)).toEqual({ back: false, forward: false });
    });

    test('a web page walks its own history before the tab', () => {
        const state = run(split(), {
            kind: 'navigate',
            location: web('v1'),
            mode: 'replace',
            tabId: 't1',
        });
        const views = new Map([['v1', { canGoBack: true, canGoForward: false }]]);
        expect(paneHistorySteps(state, 'secondary', null).back).toBeFalse();
        expect(paneHistorySteps(state, 'secondary', views).back).toBeTrue();
    });

    test('an empty pane has nowhere to go', () => {
        const state = run(split(), { kind: 'close', tabIds: ['t1'] });
        expect(paneHistorySteps(state, 'secondary', null)).toEqual({ back: false, forward: false });
    });
});
