/**
 * The pressing window's window-level listeners for one tab drag: the pointer
 * goes wherever the tab does, so they listen on the window, in the capture
 * phase. Returns the unlisten.
 */
export function listenToDragPointer(
    band: HTMLElement | null,
    on: {
        key: (event: KeyboardEvent) => void;
        lost: () => void;
        move: (event: PointerEvent) => void;
        up: (event: PointerEvent) => void;
    }
) {
    window.addEventListener('pointermove', on.move, true);
    window.addEventListener('pointerup', on.up, true);
    window.addEventListener('pointercancel', on.up, true);
    window.addEventListener('keydown', on.key, true);
    band?.addEventListener('lostpointercapture', on.lost);
    return () => {
        window.removeEventListener('pointermove', on.move, true);
        window.removeEventListener('pointerup', on.up, true);
        window.removeEventListener('pointercancel', on.up, true);
        window.removeEventListener('keydown', on.key, true);
        band?.removeEventListener('lostpointercapture', on.lost);
    };
}

export function capturePointer(band: HTMLElement | null, pointerId: number | null) {
    if (band && pointerId !== null) {
        try {
            band.setPointerCapture(pointerId);
        } catch {
            // The pointer is already gone; its pointerup ends the drag.
        }
    }
}
