import { describe, expect, test } from 'bun:test';
import { newTabLocation, type TabHistory } from '../desktop-tabs/desktop-tabs-model.ts';
import { web } from '../desktop-tabs/desktop-tabs-test-fixtures.ts';
import { pageHistoryStep } from './page-history-step.ts';

/** New tab page → a site, at the site. */
const visited: TabHistory = {
    entries: [
        { key: 'a', location: newTabLocation, pageState: {} },
        { key: 'b', location: web('v1'), pageState: {} },
    ],
    index: 1,
};
const fresh = { canGoBack: false, canGoForward: false };

describe('pageHistoryStep', () => {
    test('a web page walks its own history first', () => {
        const view = { canGoBack: true, canGoForward: false };
        expect(pageHistoryStep({ direction: 'back', history: visited, view })).toEqual({
            kind: 'view',
        });
    });

    test('past the page start, Back returns to the new tab page', () => {
        expect(pageHistoryStep({ direction: 'back', history: visited, view: fresh })).toEqual({
            delta: -1,
            kind: 'tab',
        });
        expect(pageHistoryStep({ direction: 'forward', history: visited, view: fresh })).toBe(null);
    });

    test('the new tab page steps the tab history only', () => {
        const atStart = { ...visited, index: 0 };
        expect(pageHistoryStep({ direction: 'back', history: atStart, view: null })).toBe(null);
        expect(pageHistoryStep({ direction: 'forward', history: atStart, view: null })).toEqual({
            delta: 1,
            kind: 'tab',
        });
    });
});
