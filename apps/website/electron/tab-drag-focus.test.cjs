'use strict';

const { expect, test } = require('bun:test');
const { detachRequest, harness, startDrag } = require('./tab-drag-test-fakes.cjs');

// Bands on screen: left y 28–72, x 240–1140; right y 28–72, x 1540–2440.

function tornOff(options) {
    const h = harness(options);
    h.call('desktop:tab-drag:start', h.left, startDrag);
    h.cursor.x = 300;
    h.cursor.y = 300;
    h.call('desktop:tab-drag:detach', h.left, detachRequest());
    const floating = h.windows.find((window) => window.id === 11);
    return { ...h, floating };
}

function overRight(h) {
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
}

test('a band the tab enters comes to the front without taking focus', () => {
    const h = tornOff();
    h.floating.emit('ready-to-show');
    overRight(h);
    expect(h.right.movedTop).toBe(1);
    expect(h.right.focused).toBe(false);
    expect(h.app.focusCalls).toEqual([]);
});

test('a drop into another window focuses it and, with another app active, takes over on macOS', () => {
    const h = tornOff({ active: false });
    overRight(h);
    h.call('desktop:tab-drag:end', h.left, 'drop');
    expect(h.right.focused).toBe(true);
    expect(h.app.focusCalls).toEqual([{ steal: true }]);
});

test('a drop never steals activation when Haus is already active, or off macOS', () => {
    for (const options of [{ active: true }, { active: false, platform: 'win32' }]) {
        const h = tornOff(options);
        overRight(h);
        h.call('desktop:tab-drag:end', h.left, 'drop');
        expect(h.right.focused).toBe(true);
        expect(h.app.focusCalls).toEqual([]);
    }
});

test('a torn-off tab dragged back into its own window raises and focuses that window', () => {
    const h = tornOff({ active: false });
    h.cursor.x = 300;
    h.cursor.y = 40;
    h.tick();
    expect(h.left.movedTop).toBe(1);
    h.call('desktop:tab-drag:end', h.left, 'drop');
    expect(h.left.focused).toBe(true);
    expect(h.app.focusCalls).toEqual([{ steal: true }]);
});

test('a tear-off dropped before its window can paint is focused once it shows', () => {
    const h = tornOff({ active: false });
    h.call('desktop:tab-drag:end', h.left, 'drop');
    expect(h.floating.focused).toBe(false);
    h.floating.emit('ready-to-show');
    expect(h.floating.visible).toBe(true);
    expect(h.floating.focused).toBe(true);
    expect(h.app.focusCalls).toEqual([{ steal: true }]);
});

test('a traveling one-tab window returns to the front as it leaves a band, and lands focused', () => {
    const h = harness({ active: false });
    h.call('desktop:tab-drag:start', h.left, startDrag);
    h.call('desktop:tab-drag:detach', h.left, detachRequest(true));
    const before = h.left.movedTop;
    overRight(h);
    h.cursor.y = 300;
    h.call('desktop:tab-drag:detach', h.right, detachRequest());
    expect(h.left.opacity).toBe(1);
    expect(h.left.movedTop).toBe(before + 1);
    h.call('desktop:tab-drag:end', h.left, 'drop');
    expect(h.left.focused).toBe(true);
    expect(h.app.focusCalls).toEqual([{ steal: true }]);
});
