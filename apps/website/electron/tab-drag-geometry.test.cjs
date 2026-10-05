'use strict';

const { expect, test } = require('bun:test');
const {
    bandUnderCursor,
    clientPoint,
    floatingBounds,
    grabAnchor,
    stripScreenRect,
} = require('./tab-drag-geometry.cjs');

const band = { height: 44, width: 800, x: 200, y: 0 };
const windows = [
    // Front: a window over the left half of the back one.
    {
        content: { height: 600, width: 500, x: 0, y: 300 },
        id: 1,
        serverId: 'acme',
        strip: band,
        zoom: 1,
    },
    {
        content: { height: 800, width: 1200, x: 0, y: 28 },
        id: 2,
        serverId: 'acme',
        strip: band,
        zoom: 1,
    },
    {
        content: { height: 800, width: 1200, x: 1300, y: 28 },
        id: 3,
        serverId: 'other',
        strip: band,
        zoom: 1,
    },
];

test('a band on screen follows its window content and zoom', () => {
    expect(stripScreenRect({ x: 100, y: 50 }, band, 1.5)).toEqual({
        height: 66,
        width: 1200,
        x: 400,
        y: 50,
    });
    expect(clientPoint({ x: 100, y: 50 }, { x: 400, y: 80 }, 1.5)).toEqual({ x: 200, y: 20 });
});

test('only the front window under the cursor takes the tab, and only on its band', () => {
    const options = { excludeId: null, serverId: 'acme' };
    expect(bandUnderCursor(windows, { x: 600, y: 50 }, options)).toBe(2);
    // A few px of air above or below the band still count.
    expect(bandUnderCursor(windows, { x: 600, y: 75 }, options)).toBe(2);
    // Window 2's body, not its band.
    expect(bandUnderCursor(windows, { x: 600, y: 200 }, options)).toBeNull();
    // Window 1, in front, has its own band at y 300; below it is its body.
    expect(bandUnderCursor(windows, { x: 300, y: 320 }, options)).toBe(1);
    expect(bandUnderCursor(windows, { x: 300, y: 500 }, options)).toBeNull();
    // Off every window.
    expect(bandUnderCursor(windows, { x: 1250, y: 50 }, options)).toBeNull();
});

test('a band on another Server refuses the tab; the floating window is looked through', () => {
    expect(bandUnderCursor(windows, { x: 1600, y: 50 }, { serverId: 'acme' })).toBeNull();
    expect(
        bandUnderCursor(windows, { x: 300, y: 320 }, { excludeId: 1, serverId: 'acme' })
    ).toBeNull();
    expect(bandUnderCursor(windows, { x: 300, y: 40 }, { excludeId: 1, serverId: 'acme' })).toBe(2);
});

test('a torn-off window sits so its tab is under the cursor at the same grab', () => {
    const anchor = grabAnchor(
        { content: { x: 0, y: 28 }, frame: { x: 0, y: 0 }, zoom: 1 },
        { x: 248, y: 6 },
        { x: 20, y: 10 }
    );
    expect(anchor).toEqual({ x: 268, y: 44 });
    expect(floatingBounds({ x: 900, y: 500 }, anchor, { height: 800, width: 1200 })).toEqual({
        height: 800,
        width: 1200,
        x: 632,
        y: 456,
    });
});
