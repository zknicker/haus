import * as React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Navigates on a plain primary mouse press instead of the click, the way native sidebars and
 * Chrome's tab strip feel instant. Every other gesture keeps its click path unchanged:
 * keyboard Enter, touch, right-click, and the modified or middle clicks that open new tabs
 * (ADR 0039). `onPress` runs first, so a destination preload starts with the navigation.
 *
 * A draggable row (`timing: 'release'`) waits for the pointer to come back up without moving
 * past the drag threshold, so dragging a row to reorder it never opens it. That still beats
 * the click path, which waits for React Aria's press to resolve.
 *
 * The press's own click is swallowed at the element, before React's root listener, so the
 * link's click handler (or React Aria's press action, which fires from the click) cannot
 * navigate a second time. React Aria still sees the pointer down; with its click gone, it
 * cancels the press instead of performing the action.
 */
export function usePressNavigation(
    href: string | undefined,
    onPress?: () => void,
    timing: PressTiming = 'press'
) {
    const navigate = useNavigate();
    const latest = React.useRef<PressNavigation>({ href, navigate, onPress, timing });
    // A pressed flag outlives a ref re-attach between pointer down and click (a tab
    // router's `navigate` changes identity with the location it just moved).
    const pressed = React.useRef(false);

    React.useLayoutEffect(() => {
        latest.current = { href, navigate, onPress, timing };
    });

    return React.useCallback(
        (element: HTMLElement | null) =>
            element ? bindPressNavigation(element, latest, pressed) : undefined,
        []
    );
}

/** `press` navigates on pointer down; `release` on an unmoved pointer up, for draggable rows. */
export type PressTiming = 'press' | 'release';

/** Matches the sidebar's dnd-kit `PointerSensor` activation distance. */
export const pressDragThreshold = 3;

interface PressNavigation {
    href: string | undefined;
    navigate: (href: string, options?: { flushSync?: boolean }) => void;
    onPress?: (() => void) | undefined;
    timing?: PressTiming;
}

/** Wires one element; returns its cleanup. Exported for the gesture contract test. */
export function bindPressNavigation(
    element: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
    latest: { readonly current: PressNavigation },
    pressed: { current: boolean }
) {
    // A release-timed press still waiting for its pointer up, and where it went down.
    let pending: { x: number; y: number } | null = null;
    const go = (target: string) => {
        latest.current.onPress?.();
        // Synchronous, not React Router's default transition: a transition renders the
        // destination interruptibly behind the old page for several frames.
        latest.current.navigate(target, { flushSync: true });
    };
    const handlePointerDown = (event: Event) => {
        pressed.current = false;
        pending = null;
        const target = latest.current.href;
        const pointer = event as PointerEvent;
        if (!(target && isPlainPrimaryPress(pointer))) {
            return;
        }
        // Swallow this press's click either way: navigation happens here or on release.
        pressed.current = true;
        if (latest.current.timing === 'release') {
            pending = { x: pointer.clientX, y: pointer.clientY };
            return;
        }
        go(target);
    };
    const handlePointerMove = (event: Event) => {
        if (pending && movedPastThreshold(pending, event as PointerEvent)) {
            // A drag: it never navigates, and the click a drop may still fire is swallowed.
            pending = null;
        }
    };
    const handlePointerUp = (event: Event) => {
        const start = pending;
        pending = null;
        const target = latest.current.href;
        if (start && target && !movedPastThreshold(start, event as PointerEvent)) {
            go(target);
        }
    };
    const cancelPending = () => {
        pending = null;
    };
    const handleClick = (event: Event) => {
        // A keyboard or assistive click reports no press count; it was never pressed.
        if (!pressed.current || (event as MouseEvent).detail === 0) {
            return;
        }
        pressed.current = false;
        event.preventDefault();
        event.stopPropagation();
    };
    const listeners: [string, (event: Event) => void][] = [
        ['pointerdown', handlePointerDown],
        ['pointermove', handlePointerMove],
        ['pointerup', handlePointerUp],
        ['pointerleave', cancelPending],
        ['pointercancel', cancelPending],
        ['click', handleClick],
    ];
    for (const [type, listener] of listeners) {
        element.addEventListener(type, listener);
    }
    return () => {
        for (const [type, listener] of listeners) {
            element.removeEventListener(type, listener);
        }
    };
}

export type PressGesture = Pick<
    PointerEvent,
    | 'altKey'
    | 'button'
    | 'ctrlKey'
    | 'defaultPrevented'
    | 'isPrimary'
    | 'metaKey'
    | 'pointerType'
    | 'shiftKey'
>;

/** Only an unmodified primary mouse press navigates early; touch keeps scrolling first. */
export function isPlainPrimaryPress(event: PressGesture): boolean {
    return (
        event.pointerType === 'mouse' &&
        event.isPrimary &&
        event.button === 0 &&
        !event.defaultPrevented &&
        !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    );
}

function movedPastThreshold(start: { x: number; y: number }, event: PointerEvent) {
    return Math.hypot(event.clientX - start.x, event.clientY - start.y) > pressDragThreshold;
}
