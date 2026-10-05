'use strict';

const { clientPoint, floatingBounds, grabAnchor } = require('./tab-drag-geometry.cjs');
const { browserViewIds, shownBrowserViewId } = require('./tab-drag-reports.cjs');

const followMs = 16;

/**
 * One tab drag across windows (ADR 0039), Chrome-style. The dragged tabs (one,
 * or a multi-selection) travel together as one bundle. The pressing window
 * (`source`) holds the pointer and reports the release; this session holds
 * the screen-side state:
 *
 * - **attached** to a window: the tab rides that window's band. The source
 *   drives its own band from its pointer; any other window gets the cursor
 *   relayed (`move`) at ~60Hz.
 * - **detached**: the tab lives in a floating window that follows the cursor.
 *   That is a new window holding just the tab, or, when the tab was its
 *   window's only one, the source window itself. Over a same-Server band the
 *   floating window hides and the tab attaches there.
 *
 * A tab's web views move with it (`transfer`) whenever it changes window, so
 * pages stay live with their history. The receiving window always hears of
 * the tabs (`attach`, `restore`) before their views arrive. The floating window, once made, lives
 * for the whole session and is closed if the tab lands elsewhere.
 *
 * `deps`: `transfer(from, to, viewIds, shown?)` (`shown` shows one view in
 * `to` at once), `canTransfer(from, to, viewIds)` (`to` has room for the
 * views), `openFloating({ bounds, bundle })`
 * (a hidden window that claims `bundle` and calls back on `ready-to-show`),
 * `bandAt(point, excluded)` (the front same-Server window under the cursor),
 * `raise(window, { activate })` (front; `activate` also focuses it and its
 * app), `send(window, message)`, `screen`, `timers`, and `onEnd`.
 *
 * Window order follows Chrome: a band the tab enters comes to the front
 * without focus (the floating window is hidden by then, so they never fight),
 * a traveling source window returns to the front as it detaches again, and
 * the window the tab is dropped into ends front, focused, and active.
 */
function createTabDragSession({ source, bundle, deps }) {
    const drag = {
        attached: source,
        anchor: null,
        floating: null,
        floatingReady: false,
        grab: null,
        /** A floating window that the drop left in place before it finished loading. */
        revealOnReady: false,
        /** `new`: a window made for the tab; `source`: the one-tab source window itself. */
        floatingKind: null,
        size: null,
        sourceBounds: null,
        bundle,
        timer: null,
    };
    let ended = false;
    const viewIds = () => browserViewIds(drag.bundle);
    const holder = () => (drag.floatingKind === 'source' ? source : drag.floating);

    const follow = () => {
        if (drag.timer === null) {
            drag.timer = deps.timers.setInterval(tick, followMs);
        }
    };
    const halt = () => {
        if (drag.timer !== null) {
            deps.timers.clearInterval(drag.timer);
            drag.timer = null;
        }
    };
    const showFloating = () => {
        if (drag.floatingKind === 'source') {
            source.setOpacity(1);
            // A band it hovered may have come in front of it.
            deps.raise(source, { activate: false });
        } else if (drag.floatingReady) {
            drag.floating.showInactive();
        }
    };
    const hideFloating = () => {
        if (drag.floatingKind === 'source') {
            // The source keeps the pointer only while it stays on screen, so it fades instead of hiding.
            source.setOpacity(0);
        } else {
            drag.floating?.hide();
        }
    };
    const closeFloating = () => {
        const window = drag.floating;
        if (window && !window.isDestroyed()) {
            // After this IPC reply: the closing window may be the one asking.
            deps.timers.setImmediate(() => window.isDestroyed() || window.close());
        }
    };

    function tick() {
        const point = deps.screen.getCursorScreenPoint();
        if (drag.attached) {
            if (drag.attached !== source) {
                deps.send(drag.attached, { kind: 'move', point: toClient(drag.attached, point) });
            }
            return;
        }
        if (drag.floating.isDestroyed()) {
            abort();
            return;
        }
        drag.floating.setBounds(floatingBounds(point, drag.anchor, drag.size));
        const target = deps.bandAt(point, drag.floating);
        // A window at its web view limit cannot take the tabs' pages: they keep floating.
        if (target && deps.canTransfer(holder(), target, viewIds())) {
            attach(target, point);
        }
    }

    function attach(window, point) {
        const from = holder();
        hideFloating();
        drag.attached = window;
        deps.raise(window, { activate: false });
        // The tabs first, then their views: a window that sees a view no tab names closes it.
        deps.send(window, {
            bundle: drag.bundle,
            grab: drag.grab,
            kind: 'attach',
            point: toClient(window, point),
        });
        deps.transfer(from, window, viewIds());
        if (window === source) {
            halt();
        }
    }

    /** The attached window pulled the tab off its band. */
    function detach(window, request) {
        drag.bundle = request.bundle;
        drag.grab = request.grab;
        const frame = window.getBounds();
        drag.anchor = grabAnchor(
            { content: window.getContentBounds(), frame, zoom: zoomOf(window) },
            request.slot,
            request.grab
        );
        drag.attached = null;
        const keepsTab = request.keepsWindow && window === source && drag.floating === null;
        if (keepsTab) {
            drag.floating = source;
            drag.floatingKind = 'source';
            drag.sourceBounds = frame;
        } else if (drag.floating === null) {
            const point = deps.screen.getCursorScreenPoint();
            drag.size = { height: frame.height, width: frame.width };
            drag.floatingKind = 'new';
            drag.floating = deps.openFloating({
                bounds: floatingBounds(point, drag.anchor, drag.size),
                onReady: () => {
                    drag.floatingReady = true;
                    if (drag.revealOnReady) {
                        deps.raise(drag.floating, { activate: true });
                    } else if (!(ended || drag.attached)) {
                        drag.floating.showInactive();
                    }
                },
                bundle: drag.bundle,
            });
        }
        drag.size ??= { height: frame.height, width: frame.width };
        if (!keepsTab) {
            deps.transfer(window, holder(), viewIds(), shownPage(request.body));
        }
        showFloating();
        follow();
        tick();
        return { keepsTab };
    }

    /**
     * A tear-off's page shows in the new window at once, where the source said
     * it sits (`body`), instead of waiting for that window's App to boot.
     */
    function shownPage(body) {
        const viewId = shownBrowserViewId(drag.bundle);
        return drag.floatingKind === 'new' && body && viewId ? { bounds: body, viewId } : undefined;
    }

    /** The release (or Escape) reported by the source. */
    function end(outcome) {
        if (ended) {
            return;
        }
        ended = true;
        halt();
        const { attached } = drag;
        if (outcome === 'cancel') {
            undo(attached);
        } else {
            land(attached);
        }
        deps.onEnd();
    }

    function land(attached) {
        if (attached && attached !== source) {
            deps.send(attached, { kind: 'release' });
            deps.raise(attached, { activate: true });
            // Moving the last tab out closes its now-empty window.
            closeFloating();
        } else if (attached === source) {
            deps.raise(source, { activate: true });
            if (drag.floatingKind === 'new') {
                closeFloating();
            }
        } else if (drag.floatingKind === 'new') {
            drag.revealOnReady = !drag.floatingReady;
            if (drag.floatingReady) {
                deps.raise(drag.floating, { activate: true });
            }
        } else {
            deps.raise(source, { activate: true });
        }
    }

    /** Escape: the tab goes back to where it started; the source re-adopts it (`restore`). */
    function undo(attached) {
        if (attached === source) {
            if (drag.floatingKind === 'new') {
                closeFloating();
            }
            return;
        }
        if (attached) {
            deps.send(attached, {
                kind: 'withdraw',
                tabIds: drag.bundle.tabs.map((tab) => tab.id),
            });
        }
        if (drag.floatingKind === 'source') {
            deps.transfer(attached ?? holder(), source, viewIds());
            source.setOpacity(1);
            source.setBounds(drag.sourceBounds);
            return;
        }
        // The source re-adopts its tabs before their views arrive, or it would close them.
        deps.send(source, { bundle: drag.bundle, kind: 'restore' });
        deps.transfer(attached ?? holder(), source, viewIds());
        closeFloating();
    }

    /** A window went away or the source crashed: stop without undoing anything. */
    function abort() {
        if (ended) {
            return;
        }
        ended = true;
        halt();
        if (drag.attached && drag.attached !== source && !drag.attached.isDestroyed()) {
            deps.send(drag.attached, { kind: 'end' });
        }
        if (!source.isDestroyed()) {
            if (drag.floatingKind === 'source') {
                source.setOpacity(1);
            }
            deps.send(source, { kind: 'end' });
        }
        if (drag.floatingKind === 'new' && drag.floating && !drag.floating.isDestroyed()) {
            // Detached, the floating window is the tab's home now; otherwise it holds a stale copy.
            if (drag.attached) {
                closeFloating();
            } else {
                drag.revealOnReady = !drag.floatingReady;
                showFloating();
            }
        }
        deps.onEnd();
    }

    return {
        abort,
        detach,
        end,
        /** The windows this session touches, for close handling. */
        involves: (window) => [source, drag.attached, drag.floating].includes(window),
        isAttachedTo: (window) => drag.attached === window,
        source,
        state: () => ({ ...drag, ended }),
    };
}

function toClient(window, point) {
    return clientPoint(window.getContentBounds(), point, zoomOf(window));
}

function zoomOf(window) {
    return window.webContents.getZoomFactor?.() ?? 1;
}

module.exports = { createTabDragSession };
