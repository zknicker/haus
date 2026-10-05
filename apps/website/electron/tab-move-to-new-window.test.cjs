'use strict';

const { expect, test } = require('bun:test');
const { harness, startDrag, webBundle } = require('./tab-drag-test-fakes.cjs');

const move = 'desktop:tab:move-to-new-window';

test('Move to new window opens an offset window that claims the tabs and their live pages', () => {
    const h = harness();
    expect(h.call(move, h.left, startDrag)).toBe(true);
    // No bounds: the opener rule offsets it from the source window.
    expect(h.opened).toEqual([
        {
            deferShow: true,
            opener: expect.objectContaining({ id: 1 }),
            route: '/s/acme/inbox',
        },
    ]);
    const window = h.windows.find((candidate) => candidate.id === 11);
    // Views move before the source hears back, so it never sweeps them.
    expect(h.transfers).toEqual([[1, 11, ['v1']]]);
    expect(h.claim(window)).toEqual(webBundle);
    // Claimed once only.
    expect(h.claim(window)).toBeNull();
    expect(window.visible).toBe(false);
    window.emit('ready-to-show');
    expect(window).toMatchObject({ focused: true, visible: true });
    // Not a drag: no session to end.
    expect(h.drag.session()).toBeNull();
});

test('Move to new window gives up, closing the new window, when the views have no room', () => {
    const h = harness();
    h.full.add('*');
    expect(h.call(move, h.left, startDrag)).toBe(false);
    expect(h.transfers).toEqual([]);
    expect(h.windows.map((window) => window.id)).toEqual([1, 2]);
});

test('Move to new window rejects a malformed bundle and an unsafe route', () => {
    const h = harness();
    expect(() => h.call(move, h.left, { bundle: null, route: '/', serverId: 'acme' })).toThrow();
    expect(h.call(move, h.left, { ...startDrag, route: 'https://evil.test' })).toBe(true);
    expect(h.opened.at(-1)?.route).toBeUndefined();
});
