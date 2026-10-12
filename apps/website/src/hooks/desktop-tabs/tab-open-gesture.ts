/**
 * The app-wide open gesture (ADR 0039), Chrome's link dispositions: Command-click
 * (Control-click off macOS) and middle-click open a new tab in the background
 * (`backgroundTab`, Chrome's NEW_BACKGROUND_TAB); adding Shift opens it selected
 * (`newTab`, NEW_FOREGROUND_TAB). Shift-click alone is also a selected new tab here,
 * not Chrome's new window. Command-Return (and Shift-Return) on a focused row or a
 * command menu item is the same gesture. Anything else is a plain open.
 */
export type OpenGesture = 'auto' | 'backgroundTab' | 'newTab';

export interface OpenGestureEvent {
    button?: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey?: boolean;
    type?: string;
}

export function openIntentFromEvent(event: OpenGestureEvent | null | undefined): OpenGesture {
    if (!event) {
        return 'auto';
    }
    // Only a click names the middle button; pointerup and mouseup report it too.
    // macOS Control-click is a secondary click, not a new-tab gesture.
    const background = event.button === 1 || (isMac() ? event.metaKey : event.ctrlKey);
    if (event.shiftKey) {
        return 'newTab';
    }
    return background ? 'backgroundTab' : 'auto';
}

/**
 * The open gesture of the click or Return being dispatched right now, so a router push
 * from any press handler (a chip, a command menu item, a sidebar row) honors the
 * modifiers without each call site threading the event. Cleared once the event's
 * dispatch ends: a handler that navigates after an `await` reads it before the `await`
 * and passes it on explicitly (`tabIntentState`).
 */
export function currentOpenGesture(): OpenGesture {
    return openIntentFromEvent(activeEvent);
}

/**
 * The one opt-in for middle-click on a press target that is not a link (a reference chip,
 * an Inbox row, an avatar, a Thread or artifact button): the desktop window relays a middle
 * click on it as a click, and that click's handler sees the background-tab gesture. Command-
 * and Shift-clicks need nothing: they reach the handler as ordinary clicks. Only elements
 * whose activation opens a page carry it, so a middle click never runs any other action.
 */
export const opensPlaceAttribute = 'data-opens-place';

/** Spread on a press target that opens a page (`opensPlaceAttribute`). */
export const opensPlace = { [opensPlaceAttribute]: '' } as const;

/**
 * Desktop windows track the in-flight click or Return; returns the uninstaller. Synthetic
 * events (React Aria's link clicks, the middle-click relay, a virtually focused item's
 * keyboard action) keep the user's gesture.
 */
export function trackOpenGestures(
    target: Pick<Window, 'addEventListener' | 'removeEventListener'>
) {
    const record = (event: Event) => {
        if (!event.isTrusted || (isKeyEvent(event) && event.key !== 'Enter')) {
            return;
        }
        activeEvent = event as MouseEvent | KeyboardEvent;
        const recorded = activeEvent;
        setTimeout(() => {
            if (activeEvent === recorded) {
                activeEvent = null;
            }
        }, 0);
    };
    for (const type of trackedTypes) {
        target.addEventListener(type, record, true);
    }
    return () => {
        for (const type of trackedTypes) {
            target.removeEventListener(type, record, true);
        }
        activeEvent = null;
    };
}

let activeEvent: OpenGestureEvent | null = null;

// React Aria acts on Return at keydown for some items and keyup for others.
const trackedTypes = ['pointerup', 'mouseup', 'click', 'auxclick', 'keydown', 'keyup'] as const;

function isKeyEvent(event: Event): event is KeyboardEvent {
    return event.type === 'keydown' || event.type === 'keyup';
}

function isMac() {
    return typeof navigator !== 'undefined' && /Mac/u.test(navigator.platform);
}
