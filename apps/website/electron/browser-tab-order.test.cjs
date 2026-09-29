'use strict';
const { expect, test } = require('bun:test');
const { reorderBrowserTabs } = require('./browser-tab-order.cjs');

test('reordering preserves live tab instances and rejects missing or duplicated tabs', () => {
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
    expect(() => reorderBrowserTabs(tabs, ['first', 'first'])).toThrow('exactly once');
    expect(() => reorderBrowserTabs(tabs, ['missing', 'first'])).toThrow('exactly once');
    expect(() => reorderBrowserTabs(tabs, ['first'])).toThrow('exactly once');
    expect([...tabs.keys()]).toEqual(['second', 'first']);
});
