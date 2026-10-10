import { focusManager } from '@tanstack/react-query';
import { getDesktopBridge } from './desktop-bridge.ts';

interface FocusSources {
    /** Fires `visibilitychange`. */
    document: Pick<Document, 'addEventListener' | 'removeEventListener'>;
    /** Electron: this BrowserWindow gained or lost native focus. */
    onWindowFocusChanged?: (listener: (focused: boolean) => void) => () => void;
    target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
    visibility: () => DocumentVisibilityState;
}

/**
 * Feeds React Query's focus state from every signal that means the human came
 * back: the page becoming visible, the browser window gaining focus, and, in
 * the desktop App, the native BrowserWindow gaining focus (an Electron window
 * can regain key focus without a visibility change). Each return runs the
 * focus pass (`refetchesOnFocus`, query-policy.ts). Only hiding counts as
 * unfocused: a blurred but visible window keeps its justified polls (a
 * Computer finishing attachment while the human is in another app). Returns
 * the uninstall.
 */
export function installQueryFocusSources(sources: FocusSources = browserFocusSources()) {
    focusManager.setEventListener((setFocused) => {
        // React Query notifies only on a change, so a return pulses through unfocused.
        const returned = () => {
            setFocused(false);
            setFocused(true);
        };
        const onVisibility = () =>
            sources.visibility() === 'visible' ? returned() : setFocused(false);
        const onNative = (focused: boolean) => {
            if (focused) {
                returned();
            }
        };
        sources.document.addEventListener('visibilitychange', onVisibility);
        sources.target.addEventListener('focus', returned);
        const stopNative = sources.onWindowFocusChanged?.(onNative);
        return () => {
            sources.document.removeEventListener('visibilitychange', onVisibility);
            sources.target.removeEventListener('focus', returned);
            stopNative?.();
        };
    });
    return () => focusManager.setEventListener(defaultFocusListener);
}

function browserFocusSources(): FocusSources {
    const bridge = getDesktopBridge();
    return {
        document,
        onWindowFocusChanged: bridge?.onWindowFocusChanged
            ? (listener) => bridge.onWindowFocusChanged?.(listener) ?? (() => undefined)
            : undefined,
        target: window,
        visibility: () => document.visibilityState,
    };
}

/** React Query's own listener: visibility only. */
function defaultFocusListener(setFocused: (focused?: boolean) => void) {
    if (typeof window === 'undefined') {
        return;
    }
    const onVisibility = () => setFocused();
    window.addEventListener('visibilitychange', onVisibility, false);
    return () => window.removeEventListener('visibilitychange', onVisibility);
}
