/**
 * The app-wide open gesture (ADR 0039), Chrome's link dispositions: Command-click
 * (Control-click off macOS) and middle-click open a new tab in the background
 * (`backgroundTab`, Chrome's NEW_BACKGROUND_TAB); adding Shift opens it selected
 * (`newTab`, NEW_FOREGROUND_TAB). Shift-click alone is also a selected new tab here,
 * not Chrome's new window. Anything else is a plain open.
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

/** Any new-tab gesture, background or selected. */
export function opensNewTab(gesture: OpenGesture): boolean {
    return gesture !== 'auto';
}

/**
 * The open gesture of the pointer event being dispatched right now, so a router push
 * from any press handler (a chip, a command menu item, a sidebar row) honors the
 * modifiers without each call site threading the event. Cleared once the event's
 * dispatch ends; a push after an `await` is plain.
 */
export function currentOpenGesture(): OpenGesture {
    return openIntentFromEvent(activeEvent);
}

/**
 * A press target that is not a link (a reference chip's button) opts into middle-click
 * with this attribute: the desktop window relays the middle click as a click, and the
 * relayed click's handler sees the new-tab gesture.
 */
export const opensPlaceAttribute = 'data-opens-place';

/**
 * Desktop windows track the in-flight pointer event; returns the uninstaller. Synthetic
 * events (React Aria's link clicks, the middle-click relay) keep the user's gesture.
 */
export function trackOpenGestures(
    target: Pick<Window, 'addEventListener' | 'removeEventListener'>
) {
    const record = (event: Event) => {
        if (!event.isTrusted) {
            return;
        }
        activeEvent = event as MouseEvent;
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

const trackedTypes = ['pointerup', 'mouseup', 'click', 'auxclick'] as const;

function isMac() {
    return typeof navigator !== 'undefined' && /Mac/u.test(navigator.platform);
}
