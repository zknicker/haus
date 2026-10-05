import {
    type BandLayout,
    isDragActivated,
    type Point,
    resolveSlot,
    type Slot,
    shouldDetach,
} from './tab-drag-geometry.ts';

/**
 * One window's side of a tab drag (ADR 0039), as a pure step function.
 *
 * - `pointer`: this window got the press and holds the pointer for the whole
 *   gesture, wherever the tab goes. Only it ends the session in Electron.
 * - `relay`: the tab arrived here from another window's drag; Electron feeds
 *   the cursor, since the pressing window keeps the pointer.
 *
 * Attached, the tab rides its band and nothing is committed until the drop.
 * Pulled past the detach threshold, Electron takes it into a floating window
 * (`detaching` waits for that answer); the pressing window then waits,
 * `detached`, for the release or for the tab to come back onto its band.
 */
export type TabDragOwner = 'pointer' | 'relay';
export type TabDragOutcome = 'cancel' | 'drop';

interface Grabbed {
    /** The pointer's offset from the dragged block's top left when pressed. */
    grab: Point;
    /** Where the block started in this window, for Escape after it left and came back. */
    origin: Slot;
    /** The dragged tabs in row order: the pressed tab, or its pane's multi-selection. */
    tabIds: readonly string[];
}

interface Riding extends Grabbed {
    owner: TabDragOwner;
    pointer: Point;
    /**
     * The tabs left this window and were adopted back mid-drag, so their
     * original places are gone: Escape puts them back at `origin` instead of
     * leaving the rows untouched.
     */
    readopted: boolean;
    slot: Slot;
}

export type TabDragState =
    | { phase: 'idle' }
    | ({ phase: 'pressed'; start: Point } & Grabbed)
    | ({ phase: 'attached' } & Riding)
    | ({ phase: 'detaching'; pendingEnd: TabDragOutcome | null } & Riding)
    | ({ phase: 'detached' } & Grabbed);

export type TabDragEvent =
    | ({ kind: 'press'; point: Point } & Grabbed)
    /** `draggedWidth`: the dragged block as drawn, gaps included. */
    | { draggedWidth: number; kind: 'move'; layout: BandLayout | null; point: Point }
    /** Pointer up here, or Electron's drop for a relayed tab. */
    | { kind: 'release' }
    /** Escape, pointer owner only. */
    | { kind: 'cancel' }
    /** Electron took the tab; `keepsTab` when this whole window moves with it. */
    | { keepsTab: boolean; kind: 'detached' }
    | { kind: 'detach-refused' }
    /** Electron put the tabs on this window's band; the window has adopted them at `slot`. */
    | { grab: Point; kind: 'attach'; point: Point; slot: Slot; tabIds: readonly string[] }
    /** Electron took a relayed tab away again, or ended the session. */
    | { kind: 'withdrawn' };

export type TabDragEffect =
    /** The drag began: cover web views, capture the pointer, open the Electron session. */
    | { kind: 'start'; tabIds: readonly string[] }
    | { kind: 'detach'; tabIds: readonly string[] }
    /** Land the tabs side by side at `slot` (a no-op where they already are). */
    | { kind: 'commit'; slot: Slot; tabIds: readonly string[] }
    /** Take the tabs out of this window without closed-tab records. */
    | { kind: 'release-tab'; tabIds: readonly string[] }
    /** Pointer owner: tell Electron how the gesture ended. */
    | { kind: 'end'; outcome: TabDragOutcome }
    /** Local teardown: uncover web views, drop listeners. */
    | { kind: 'cleanup' };

export interface TabDragStep {
    effects: TabDragEffect[];
    state: TabDragState;
}

export const idleTabDrag: TabDragState = { phase: 'idle' };

export function stepTabDrag(state: TabDragState, event: TabDragEvent): TabDragStep {
    switch (event.kind) {
        case 'press':
            return state.phase === 'idle'
                ? done({ ...grabbed(event), phase: 'pressed', start: event.point })
                : done(state);
        case 'move':
            return move(state, event);
        case 'release':
            return end(state, 'drop');
        case 'cancel':
            return end(state, 'cancel');
        case 'detached':
            return detached(state, event.keepsTab);
        case 'detach-refused':
            return refused(state);
        case 'attach':
            return attach(state, event);
        case 'withdrawn':
            return state.phase === 'idle' ? done(state) : done(idleTabDrag, cleanupOf(state));
    }
}

function move(state: TabDragState, event: Extract<TabDragEvent, { kind: 'move' }>): TabDragStep {
    if (state.phase === 'pressed') {
        if (!isDragActivated(state.start, event.point)) {
            return done(state);
        }
        const attached: TabDragState = {
            ...grabbed(state),
            owner: 'pointer',
            phase: 'attached',
            pointer: event.point,
            readopted: false,
            slot: state.origin,
        };
        const next = move(attached, event);
        return {
            effects: [{ kind: 'start', tabIds: state.tabIds }, ...next.effects],
            state: next.state,
        };
    }
    if (state.phase !== 'attached') {
        return done(state);
    }
    const { layout, point } = event;
    if (layout && shouldDetach(point, layout)) {
        return done({ ...state, pendingEnd: null, phase: 'detaching', pointer: point }, [
            { kind: 'detach', tabIds: state.tabIds },
        ]);
    }
    const slot = layout
        ? resolveSlot(layout, {
              draggedIds: state.tabIds,
              draggedWidth: event.draggedWidth,
              grabX: state.grab.x,
              pointer: point,
          })
        : null;
    return done({ ...state, pointer: point, slot: slot ?? state.slot });
}

function end(state: TabDragState, outcome: TabDragOutcome): TabDragStep {
    switch (state.phase) {
        case 'idle':
            return done(state);
        case 'pressed':
            return done(idleTabDrag);
        case 'attached': {
            if (state.owner === 'relay') {
                // Electron decides a relayed tab's fate; a relayed drop lands where it is.
                return done(idleTabDrag, [
                    { kind: 'commit', slot: state.slot, tabIds: state.tabIds },
                ]);
            }
            // Escape: the rows were never touched unless the tabs left and came back.
            const slot = outcome === 'drop' ? state.slot : state.readopted ? state.origin : null;
            return done(idleTabDrag, [
                ...(slot ? [{ kind: 'commit' as const, slot, tabIds: state.tabIds }] : []),
                { kind: 'end', outcome },
                { kind: 'cleanup' },
            ]);
        }
        case 'detaching':
            return done({ ...state, pendingEnd: state.pendingEnd ?? outcome });
        case 'detached':
            return done(idleTabDrag, [{ kind: 'end', outcome }, { kind: 'cleanup' }]);
    }
}

function detached(state: TabDragState, keepsTab: boolean): TabDragStep {
    if (state.phase !== 'detaching') {
        return done(state);
    }
    const release: TabDragEffect[] = keepsTab
        ? []
        : [{ kind: 'release-tab', tabIds: state.tabIds }];
    if (state.owner === 'relay') {
        return done(idleTabDrag, release);
    }
    if (state.pendingEnd) {
        return done(idleTabDrag, [
            ...release,
            { kind: 'end', outcome: state.pendingEnd },
            { kind: 'cleanup' },
        ]);
    }
    return done({ ...grabbed(state), phase: 'detached' }, release);
}

function refused(state: TabDragState): TabDragStep {
    if (state.phase !== 'detaching') {
        return done(state);
    }
    const { pendingEnd, ...riding } = state;
    const attached: TabDragState = { ...riding, phase: 'attached' };
    return pendingEnd ? end(attached, pendingEnd) : done(attached);
}

function attach(
    state: TabDragState,
    event: Extract<TabDragEvent, { kind: 'attach' }>
): TabDragStep {
    const riding = {
        grab: event.grab,
        pointer: event.point,
        slot: event.slot,
        tabIds: event.tabIds,
    };
    if (state.phase === 'detached' && sameTabs(state.tabIds, event.tabIds)) {
        return done({
            ...riding,
            origin: state.origin,
            owner: 'pointer',
            phase: 'attached',
            readopted: true,
        });
    }
    if (state.phase === 'idle') {
        return done({
            ...riding,
            origin: event.slot,
            owner: 'relay',
            phase: 'attached',
            readopted: false,
        });
    }
    return done(state);
}

function grabbed(value: Grabbed): Grabbed {
    return { grab: value.grab, origin: value.origin, tabIds: value.tabIds };
}

function sameTabs(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, index) => b[index] === id);
}

function cleanupOf(state: TabDragState): TabDragEffect[] {
    const owned =
        state.phase === 'detached' ||
        ((state.phase === 'attached' || state.phase === 'detaching') && state.owner === 'pointer');
    return owned ? [{ kind: 'cleanup' }] : [];
}

function done(state: TabDragState, effects: TabDragEffect[] = []): TabDragStep {
    return { effects, state };
}
