'use strict';

const { expect, test } = require('bun:test');
const { tornOff } = require('./tab-drag-test-fakes.cjs');

// Left window content starts at y 28; its band spans y 28–72, x 240–1140 on screen.
// Right window's band spans y 28–72, x 1540–2440.

test('a window hears of its tabs before their pages arrive, so it never closes them as unnamed', () => {
    const h = tornOff();
    h.floating.emit('ready-to-show');
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
    h.call('desktop:tab-drag:end', h.left, 'cancel');
    const steps = h.timeline.filter(([kind, , what]) => kind === 'transfer' || what !== 'move');
    const attachAt = steps.findIndex(([, id, kind]) => id === 2 && kind === 'attach');
    const intoRight = steps.findIndex(([kind, , to]) => kind === 'transfer' && to === 2);
    const restoreAt = steps.findIndex(([, id, kind]) => id === 1 && kind === 'restore');
    const backHome = steps.findLastIndex(([kind, , to]) => kind === 'transfer' && to === 1);
    expect(attachAt).toBeGreaterThan(-1);
    expect(attachAt).toBeLessThan(intoRight);
    expect(restoreAt).toBeGreaterThan(-1);
    expect(restoreAt).toBeLessThan(backHome);
});

test('a band at its web view limit refuses the tab: it keeps floating and lands in its own window', () => {
    const h = tornOff();
    h.floating.emit('ready-to-show');
    h.full.add(h.right);
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
    expect(h.messages(h.right).filter((message) => message.kind === 'attach')).toEqual([]);
    expect(h.floating.visible).toBe(true);
    expect(h.transfers.filter(([, to]) => to === 2)).toEqual([]);
    h.call('desktop:tab-drag:end', h.left, 'drop');
    h.flush();
    expect(h.floating.closed).toBe(false);
});
