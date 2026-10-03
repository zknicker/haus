'use strict';
const { expect, test } = require('bun:test');
const { reorderBrowserTabs } = require('./browser-tab-order.cjs');

test('reordering preserves live tab instances', () => {
    const first = { page: 'first' };
    const second = { page: 'second' };
    const tabs = new Map([
        ['first', first],
        ['second', second],
    ]);
    reorderBrowserTabs(tabs, ['second', 'first']);
    expect([...tabs]).toEqual([
        ['second', second],
        ['first', first],
    ]);
});

test('a stale order applies its relative order, ignores unknown ids, and keeps new tabs after it', () => {
    const tabs = new Map([
        ['a', {}],
        ['b', {}],
        ['c', {}],
        ['d', {}],
    ]);
    // The App's snapshot predates `d` and still names a closed `gone`.
    reorderBrowserTabs(tabs, ['c', 'gone', 'a', 'c', 'b']);
    expect([...tabs.keys()]).toEqual(['c', 'a', 'b', 'd']);
    reorderBrowserTabs(tabs, ['b']);
    expect([...tabs.keys()]).toEqual(['b', 'c', 'a', 'd']);
    expect(() => reorderBrowserTabs(tabs, null)).toThrow('list of browser tab ids');
});
