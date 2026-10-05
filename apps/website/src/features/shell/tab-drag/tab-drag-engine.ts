import type { DesktopTabsApi } from '../../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { allTabIds, type TabBundle } from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { bundleOf } from '../../../hooks/desktop-tabs/desktop-tabs-transfer.ts';
import type { HausDesktopBridge } from '../../../lib/desktop-bridge.ts';
import { coverBrowserViews } from '../../../lib/desktop-browser.ts';
import { parseDetachReply } from '../../../lib/desktop-tab-drag.ts';
import { detachedPageBounds } from './detached-page-bounds.ts';
import { firstSlotPoint, measureBand, tabElement } from './tab-band-dom.ts';
import { createTabAutoScroll } from './tab-drag-autoscroll.ts';
import {
    blockWidth,
    draggedBoxes,
    dragOffset,
    type Point,
    type Slot,
} from './tab-drag-geometry.ts';
import { createTabDragLayer } from './tab-drag-layer.ts';
import {
    idleTabDrag,
    stepTabDrag,
    type TabDragEffect,
    type TabDragEvent,
    type TabDragState,
} from './tab-drag-machine.ts';
import { capturePointer, listenToDragPointer } from './tab-drag-pointer.ts';
import { blockGrab, pressTab } from './tab-drag-press.ts';
import { slotOfTab, slotTarget } from './tab-drag-projection.ts';
import type { TabDragViewStore } from './tab-drag-view.ts';

export interface TabDragDeps {
    band: () => HTMLElement | null;
    bridge: () => HausDesktopBridge | null;
    /** The band's layer that draws the dragged tabs above both rows (`tab-drag-layer.ts`). */
    layer: () => HTMLElement | null;
    /** Where a torn-off window boots before it claims its tab. */
    route: string;
    serverId: string;
    tabs: () => DesktopTabsApi;
    /** The window's drag view; the engine is its only writer. */
    view: TabDragViewStore;
}

/**
 * One window's tab drag (ADR 0039): runs `stepTabDrag` and carries out its
 * effects against the tabs, the band DOM, and Electron. A drag carries the
 * pressed tab's pane selection (one tab, or a multi-selection drawn side by
 * side), Chrome-style, drawn by the band's drag layer. The pressing window
 * holds the pointer for the whole gesture (macOS keeps delivering a pressed
 * pointer's events to the window that got the press, even over other windows),
 * so its window-level pointer listeners drive the drag wherever the tab goes;
 * Electron polls the screen cursor for everything between windows. If the
 * pointer up never arrives, losing pointer capture drops the tab where it is.
 */
export function createTabDragEngine(deps: TabDragDeps) {
    const { view } = deps;
    let state: TabDragState = idleTabDrag;
    let pointerId: number | null = null;
    let uncover: (() => void) | null = null;
    let unlisten: (() => void) | null = null;
    /** The dragged tab's width as last painted, so a row it enters can ease from it. */
    let paintedWidth: number | null = null;
    /** A plain press on a tab of a multi-selection: a click (no drag) selects it alone. */
    let collapseOnClick: string | null = null;
    /** Where cancelled tabs go back to when Electron returns them (`restore`). */
    let restoreAt: Slot | null = null;
    const layer = createTabDragLayer(deps);

    const dispatch = (event: TabDragEvent) => {
        const before = state;
        const step = stepTabDrag(state, event);
        state = step.state;
        for (const effect of step.effects) {
            run(effect, before);
        }
        if (state.phase === 'idle') {
            teardown();
        }
        const riding = state.phase === 'attached' || state.phase === 'detaching' ? state : null;
        if (!riding) {
            layer.letGo();
        }
        const drawn = view.get();
        view.set(
            riding
                ? {
                      draggingIds: riding.tabIds,
                      slot: riding.slot,
                      visiting: riding.owner === 'relay',
                  }
                : null
        );
        // A new view repaints once React has laid it out (`useDraggedRow`); painting it
        // now would measure the rows before they change.
        if (view.get() === drawn) {
            paint();
        }
    };

    const move = (point: Point) => {
        const band = deps.band();
        const layout = band ? measureBand(band) : null;
        const ids = 'tabIds' in state ? state.tabIds : [];
        const width = layout ? blockWidth(layout, draggedBoxes(layout, ids)) : 0;
        dispatch({ draggedWidth: width, kind: 'move', layout, point });
        autoScroll.check();
    };
    const autoScroll = createTabAutoScroll(deps.band, () => state, move);

    /** Draws the dragged tabs at the pointer; runs after every move and every row commit. */
    const paint = () => {
        const band = deps.band();
        if (!(band && (state.phase === 'attached' || state.phase === 'detaching'))) {
            paintedWidth = null;
            return;
        }
        const offset = dragOffset(measureBand(band), {
            draggedIds: state.tabIds,
            grabX: state.grab.x,
            pointer: state.pointer,
        });
        if (offset !== null) {
            paintedWidth = layer.draw(state.tabIds, offset) ?? paintedWidth;
        }
    };

    const run = (effect: TabDragEffect, before: TabDragState) => {
        const tabs = deps.tabs();
        const bridge = deps.bridge();
        switch (effect.kind) {
            case 'start': {
                uncover = coverBrowserViews();
                capturePointer(deps.band(), pointerId);
                const bundle = bundleOf(tabs.state, effect.tabIds);
                void bridge
                    ?.tabDragStart?.({ bundle, route: deps.route, serverId: deps.serverId })
                    .catch(() => undefined);
                break;
            }
            case 'detach':
                requestDetach(effect.tabIds);
                break;
            case 'commit': {
                const target = slotTarget(tabs.state, effect.tabIds, effect.slot);
                if (target) {
                    tabs.move(effect.tabIds, target);
                }
                break;
            }
            case 'release-tab':
                tabs.release(effect.tabIds);
                break;
            case 'end':
                restoreAt =
                    effect.outcome === 'cancel' && 'origin' in before ? before.origin : null;
                void bridge?.tabDragEnd?.(effect.outcome).catch(() => undefined);
                break;
            case 'cleanup':
                teardown();
                break;
        }
    };

    const requestDetach = (tabIds: readonly string[]) => {
        const bridge = deps.bridge();
        const band = deps.band();
        const tabs = deps.tabs();
        const bundle = bundleOf(tabs.state, tabIds);
        const element = band && tabIds[0] ? tabElement(band, tabIds[0]) : null;
        if (!(bridge?.tabDragDetach && band && bundle && element && 'grab' in state)) {
            queueMicrotask(() => dispatch({ kind: 'detach-refused' }));
            return;
        }
        const owner = 'owner' in state ? state.owner : 'relay';
        bridge
            .tabDragDetach({
                body: detachedPageBounds(band.ownerDocument, bundle.activeTabId),
                bundle,
                grab: state.grab,
                // Every tab of the window is dragging: the window itself travels.
                keepsWindow: owner === 'pointer' && allTabIds(tabs.state).length === tabIds.length,
                slot: firstSlotPoint(measureBand(band), element.getBoundingClientRect().top),
            })
            .then(
                (value) => {
                    const reply = parseDetachReply(value);
                    dispatch(
                        reply
                            ? { keepsTab: reply.keepsTab, kind: 'detached' }
                            : { kind: 'detach-refused' }
                    );
                },
                () => dispatch({ kind: 'detach-refused' })
            );
    };

    const listen = () => {
        const band = deps.band();
        const onMove = (event: PointerEvent) => {
            if (event.pointerId === pointerId) {
                move({ x: event.clientX, y: event.clientY });
            }
        };
        const onUp = (event: PointerEvent) => {
            if (event.pointerId !== pointerId) {
                return;
            }
            // Chrome's `Tab::OnMouseReleased`: a plain click inside a multi-selection selects that tab alone.
            if (state.phase === 'pressed' && collapseOnClick && event.type === 'pointerup') {
                deps.tabs().select(collapseOnClick);
            }
            dispatch({ kind: 'release' });
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && state.phase !== 'pressed') {
                event.preventDefault();
                event.stopPropagation();
                dispatch({ kind: 'cancel' });
            }
        };
        // Fallback: a capture lost without a pointerup (the OS took the pointer) drops the tab.
        const onLost = () => {
            if (state.phase !== 'idle' && state.phase !== 'pressed') {
                dispatch({ kind: 'release' });
            }
        };
        unlisten = listenToDragPointer(band, { key: onKey, lost: onLost, move: onMove, up: onUp });
    };

    const teardown = () => {
        unlisten?.();
        unlisten = null;
        uncover?.();
        uncover = null;
        autoScroll.stop();
        pointerId = null;
        paintedWidth = null;
        collapseOnClick = null;
    };

    return {
        dispatch,
        /** Measures the band and moves a relayed tab. */
        move,
        paint,
        paintedWidth: () => paintedWidth,
        /**
         * Escape returned tabs that had left this window: adopt them where the
         * drag began, synchronously, before their web views arrive.
         */
        restore(bundle: TabBundle | null) {
            const origin = restoreAt;
            restoreAt = null;
            if (!bundle) {
                return;
            }
            const ids = bundle.tabs.map((tab) => tab.id);
            const tabs = deps.tabs();
            const target = origin ? slotTarget(tabs.state, ids, origin) : null;
            if (target && !ids.some((id) => tabs.state.tabs[id])) {
                tabs.adopt(bundle, target);
            }
        },
        /** Press on a tab: Chrome's selection rules now (`pressTab`); its selection drags after a few pixels. */
        press(tabId: string, event: PointerEvent | React.PointerEvent) {
            const tabs = deps.tabs();
            const band = deps.band();
            const element = (event.currentTarget as Element).closest('[data-tab-id]');
            if (event.button !== 0 || state.phase !== 'idle' || !(band && element)) {
                return;
            }
            const pressed = pressTab(tabs, tabId, event);
            const origin = pressed ? slotOfTab(tabs.state, tabId, pressed.tabIds) : null;
            if (!(pressed && origin)) {
                return;
            }
            const point = { x: event.clientX, y: event.clientY };
            collapseOnClick = pressed.collapseOnClick ? tabId : null;
            pointerId = event.pointerId;
            listen();
            dispatch({
                grab: blockGrab(band, element, pressed.tabIds, tabId, point),
                kind: 'press',
                origin,
                point,
                tabIds: pressed.tabIds,
            });
        },
        state: () => state,
        teardown,
        view,
    };
}

export type TabDragEngine = ReturnType<typeof createTabDragEngine>;
