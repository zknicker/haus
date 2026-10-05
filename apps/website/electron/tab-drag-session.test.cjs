'use strict';

const { expect, test } = require('bun:test');
const {
    detachRequest,
    harness,
    startDrag,
    tornOff,
    webBundle,
    webTab,
} = require('./tab-drag-test-fakes.cjs');

// Left window content starts at y 28; its band spans y 28–72, x 240–1140 on screen.
// Right window's band spans y 28–72, x 1540–2440.

test('a drag that stays on its own band never polls, moves views, or opens a window', () => {
    const h = harness();
    h.call('desktop:tab-drag:start', h.left, startDrag);
    expect(h.messages(h.right)).toEqual([{ kind: 'measure' }]);
    expect(h.call('desktop:tab-drag:end', h.left, 'drop')).toBeNull();
    expect(h.ticks.size).toBe(0);
    expect(h.transfers).toEqual([]);
    expect(h.opened).toEqual([]);
    expect(h.drag.session()).toBeNull();
});

test('tearing off opens a window under the cursor that claims the tab and its live page', () => {
    const { claim, cursor, floating, opened, reply, tick, transfers } = tornOff();
    expect(reply).toEqual({ keepsTab: false });
    // The grab point (content inset + slot + grab = 268, 44) lands on the cursor.
    expect(opened).toEqual([
        {
            bounds: { height: 800, width: 1200, x: 32, y: 256 },
            deferShow: true,
            // The pressing window hands the new one its query cache.
            opener: expect.objectContaining({ id: 1 }),
            route: '/s/acme/inbox',
        },
    ]);
    expect(transfers).toEqual([[1, 11, ['v1']]]);
    expect(claim(floating, 'other')).toBeNull();
    expect(claim(floating)).toBeNull();
    // Hidden until it can paint, then shown without taking focus from the pressing window.
    expect(floating.visible).toBe(false);
    floating.emit('ready-to-show');
    expect(floating.visible).toBe(true);
    expect(floating.focused).toBe(false);
    cursor.x = 400;
    tick();
    expect(floating.frame).toMatchObject({ x: 132, y: 256 });
});

test('the torn-off window claims its tab once, for its own Server', () => {
    const h = harness();
    h.call('desktop:tab-drag:start', h.left, startDrag);
    h.call('desktop:tab-drag:detach', h.left, detachRequest());
    const floating = h.windows.find((window) => window.id === 11);
    expect(h.claim(floating)).toEqual(webBundle);
    expect(h.claim(floating)).toBeNull();
});

test('a dragged multi-selection travels as one bundle: every page moves, the active one shows', () => {
    const second = {
        history: {
            entries: [
                {
                    key: 'k3',
                    location: { kind: 'browser', title: 'y', url: 'https://y.test', viewId: 'v2' },
                    pageState: {},
                },
            ],
            index: 0,
        },
        id: 'tab-2',
    };
    const bundle = { activeTabId: 'tab-2', tabs: [webTab, second] };
    const body = { height: 700, width: 1200, x: 0, y: 40 };
    const h = harness();
    h.call('desktop:tab-drag:start', h.left, { ...startDrag, bundle });
    h.call('desktop:tab-drag:detach', h.left, detachRequest(false, { body, bundle }));
    const floating = h.windows.find((window) => window.id === 11);
    expect(h.transfers).toEqual([[1, 11, ['v1', 'v2'], { bounds: body, viewId: 'v2' }]]);
    expect(h.claim(floating)).toEqual(bundle);
    h.call('desktop:tab-drag:end', h.left, 'cancel');
    expect(h.messages(h.left).at(-1)).toEqual({ bundle, kind: 'restore' });
});

test('a bundle whose active tab is not among its tabs is refused', () => {
    const h = harness();
    expect(() =>
        h.call('desktop:tab-drag:start', h.left, {
            ...startDrag,
            bundle: { activeTabId: 'missing', tabs: [webTab] },
        })
    ).toThrow();
});

test('over another window band the tab attaches there and rides the relayed cursor to its drop', () => {
    const h = tornOff();
    h.floating.emit('ready-to-show');
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
    expect(h.floating.visible).toBe(false);
    expect(h.transfers.at(-1)).toEqual([11, 2, ['v1']]);
    expect(h.messages(h.right).at(-1)).toEqual({
        grab: { x: 20, y: 10 },
        kind: 'attach',
        point: { x: 300, y: 12 },
        bundle: webBundle,
    });
    h.cursor.x = 1700;
    h.tick();
    expect(h.messages(h.right).at(-1)).toEqual({ kind: 'move', point: { x: 400, y: 12 } });

    expect(h.call('desktop:tab-drag:end', h.left, 'drop')).toBeNull();
    expect(h.messages(h.right).at(-1)).toEqual({ kind: 'release' });
    expect(h.right.focused).toBe(true);
    expect(h.ticks.size).toBe(0);
    h.flush();
    expect(h.floating.closed).toBe(true);
});

test('pulled back off the other band, the floating window returns with the page', () => {
    const h = tornOff();
    h.floating.emit('ready-to-show');
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
    h.cursor.y = 300;
    expect(h.call('desktop:tab-drag:detach', h.right, detachRequest())).toEqual({
        keepsTab: false,
    });
    expect(h.opened).toHaveLength(1);
    expect(h.transfers.at(-1)).toEqual([2, 11, ['v1']]);
    expect(h.floating.visible).toBe(true);
    // Released in the open, the floating window stays as the tab's new window.
    h.call('desktop:tab-drag:end', h.left, 'drop');
    h.flush();
    expect(h.floating.closed).toBe(false);
    expect(h.floating.focused).toBe(true);
});

test('a band on another Server refuses the tab', () => {
    const h = tornOff();
    h.call('desktop:tab-strip:report', h.right, {
        rect: { height: 44, width: 900, x: 240, y: 0 },
        serverId: 'other',
    });
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
    expect(h.messages(h.right).filter((message) => message.kind === 'attach')).toEqual([]);
});

test("a window's only tab takes the window with it, and closes it once dropped elsewhere", () => {
    const h = harness();
    h.call('desktop:tab-drag:start', h.left, startDrag);
    h.cursor.x = 300;
    h.cursor.y = 300;
    expect(h.call('desktop:tab-drag:detach', h.left, detachRequest(true))).toEqual({
        keepsTab: true,
    });
    expect(h.opened).toEqual([]);
    expect(h.left.frame).toMatchObject({ x: 32, y: 256 });
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
    expect(h.left.opacity).toBe(0);
    expect(h.transfers).toEqual([[1, 2, ['v1']]]);
    h.call('desktop:tab-drag:end', h.left, 'drop');
    h.flush();
    expect(h.left.closed).toBe(true);
});

test('Escape puts a torn-off tab back in its window and closes the floating one', () => {
    const h = tornOff();
    expect(h.call('desktop:tab-drag:end', h.left, 'cancel')).toBeNull();
    expect(h.messages(h.left).at(-1)).toEqual({ bundle: webBundle, kind: 'restore' });
    expect(h.transfers.at(-1)).toEqual([11, 1, ['v1']]);
    h.flush();
    expect(h.floating.closed).toBe(true);
});

test('Escape over another window withdraws the tab from it', () => {
    const h = tornOff();
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
    expect(h.call('desktop:tab-drag:end', h.left, 'cancel')).toBeNull();
    expect(h.messages(h.right).at(-1)).toEqual({ kind: 'withdraw', tabIds: ['tab-1'] });
    expect(h.transfers.at(-1)).toEqual([2, 1, ['v1']]);
});

test('Escape with a traveling one-tab window puts the window back', () => {
    const h = harness();
    h.call('desktop:tab-drag:start', h.left, startDrag);
    h.cursor.x = 900;
    h.cursor.y = 500;
    h.call('desktop:tab-drag:detach', h.left, detachRequest(true));
    expect(h.call('desktop:tab-drag:end', h.left, 'cancel')).toBeNull();
    expect(h.left.frame).toEqual({ height: 800, width: 1200, x: 0, y: 0 });
});

test('a crashed pressing page ends the session and leaves the torn-off window in place', () => {
    const h = tornOff();
    h.left.webContents.emit('render-process-gone');
    expect(h.ticks.size).toBe(0);
    expect(h.drag.session()).toBeNull();
    // Not ready yet: it shows once it can paint.
    h.floating.emit('ready-to-show');
    expect(h.floating.visible).toBe(true);
});

test('closing the window a tab rides ends the session for everyone', () => {
    const h = tornOff();
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
    h.right.close();
    expect(h.drag.session()).toBeNull();
    expect(h.ticks.size).toBe(0);
    expect(h.messages(h.left).at(-1)).toEqual({ kind: 'end' });
});

test('only the window a tab rides may detach it, and only the pressing window ends it', () => {
    const h = harness();
    expect(() => h.call('desktop:tab-drag:detach', h.left, detachRequest())).toThrow();
    h.call('desktop:tab-drag:start', h.left, startDrag);
    expect(() => h.call('desktop:tab-drag:detach', h.right, detachRequest())).toThrow();
    expect(h.call('desktop:tab-drag:end', h.right, 'drop')).toBeNull();
    expect(h.drag.session()).not.toBeNull();
    expect(() => h.call('desktop:tab-drag:start', h.left, { serverId: 'acme' })).toThrow();
});

test('a torn-off web page shows in the new window at once, where the source page sat', () => {
    const h = harness();
    const body = { height: 700, radius: 12, width: 900, x: 280, y: 96 };
    h.call('desktop:tab-drag:start', h.left, startDrag);
    h.cursor.x = 300;
    h.cursor.y = 300;
    h.call('desktop:tab-drag:detach', h.left, detachRequest(false, { body }));
    expect(h.transfers).toEqual([[1, 11, ['v1'], { bounds: body, viewId: 'v1' }]]);
    // Riding onto another band hands the page over hidden; that window's App places it.
    h.cursor.x = 1600;
    h.cursor.y = 40;
    h.tick();
    expect(h.transfers.at(-1)).toEqual([11, 2, ['v1']]);
});

test('a one-tab window that travels with its tab keeps its page where it is', () => {
    const h = harness();
    h.call('desktop:tab-drag:start', h.left, startDrag);
    h.call(
        'desktop:tab-drag:detach',
        h.left,
        detachRequest(true, { body: { height: 1, width: 1, x: 0, y: 0 } })
    );
    expect(h.transfers).toEqual([]);
});

test('a detach with a malformed page body is refused', () => {
    const h = harness();
    h.call('desktop:tab-drag:start', h.left, startDrag);
    expect(() =>
        h.call(
            'desktop:tab-drag:detach',
            h.left,
            detachRequest(false, { body: { x: -1, y: 0, width: 5, height: 5 } })
        )
    ).toThrow();
    expect(() =>
        h.call(
            'desktop:tab-drag:detach',
            h.left,
            detachRequest(false, { body: { x: 0, y: 0, width: 5 } })
        )
    ).toThrow();
});
