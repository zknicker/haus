import { expect, test } from 'bun:test';
import { parseBrowserWorkspace } from './desktop-browser.ts';

const tab = {
    id: 'page',
    title: 'Amazon',
    url: 'https://amazon.com',
    error: null,
    loading: false,
    canGoBack: false,
    canGoForward: false,
};

test('browser snapshots validate the entire tab and active identity', () => {
    expect(parseBrowserWorkspace({ activeId: 'page', tabs: [tab] })).toEqual({
        activeId: 'page',
        tabs: [tab],
    });
    for (const value of [
        null,
        {},
        { activeId: 'missing', tabs: [tab] },
        { activeId: null, tabs: [{ ...tab, loading: 'true' }] },
        { activeId: null, tabs: [{}] },
    ]) {
        expect(parseBrowserWorkspace(value)).toBeNull();
    }
});
