import * as React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Navigates on a plain primary mouse press instead of the click, the way native sidebars and
 * Chrome's tab strip feel instant. Every other gesture keeps its click path unchanged:
 * keyboard Enter, touch, right-click, and the modified or middle clicks that open new tabs
 * (ADR 0039). `onPress` runs first, so a destination preload starts with the navigation.
 *
 * A draggable row navigates on press too, like a Chrome tab: dragging it to reorder also
 * opens it. Its drag sensor must see the pointer down before this navigation re-renders it.
 *
 * The press's own click is swallowed at the element, before React's root listener, so the
 * link's click handler (or React Aria's press action, which fires from the click) cannot
 * navigate a second time. React Aria still sees the pointer down; with its click gone, it
 * cancels the press instead of performing the action.
 */
export function usePressNavigation(href: string | undefined, onPress?: () => void) {
    const navigate = useNavigate();
    const latest = React.useRef<PressNavigation>({ href, navigate, onPress });
    // A pressed flag outlives a ref re-attach between pointer down and click (a tab
    // router's `navigate` changes identity with the location it just moved).
    const pressed = React.useRef(false);

    React.useLayoutEffect(() => {
        latest.current = { href, navigate, onPress };
    });

    return React.useCallback(
        (element: HTMLElement | null) =>
            element ? bindPressNavigation(element, latest, pressed) : undefined,
        []
    );
}

interface PressNavigation {
    href: string | undefined;
    navigate: (href: string, options?: { flushSync?: boolean }) => void;
    onPress?: (() => void) | undefined;
}

/** Wires one element; returns its cleanup. Exported for the gesture contract test. */
export function bindPressNavigation(
    element: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
    latest: { readonly current: PressNavigation },
    pressed: { current: boolean }
) {
    const handlePointerDown = (event: Event) => {
        pressed.current = false;
        const target = latest.current.href;
        if (!(target && isPlainPrimaryPress(event as PointerEvent))) {
            return;
        }
        pressed.current = true;
        latest.current.onPress?.();
        // Synchronous, not React Router's default transition: a transition renders the
        // destination interruptibly behind the old page for several frames.
        latest.current.navigate(target, { flushSync: true });
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
    element.addEventListener('pointerdown', handlePointerDown);
    element.addEventListener('click', handleClick);
    return () => {
        element.removeEventListener('pointerdown', handlePointerDown);
        element.removeEventListener('click', handleClick);
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
