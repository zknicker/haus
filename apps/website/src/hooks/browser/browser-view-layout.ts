import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { BrowserBounds, BrowserViewPlacement } from '../../lib/desktop-browser.ts';

/**
 * One window's web view placements (ADR 0039). Every shown browser page places
 * its own view; Electron takes the whole list at once, so each change sends
 * every placement and views left out hide. `focused` follows the page in the
 * focused pane and travels on its placement.
 */
export function createBrowserViewLayout(
    send: (placements: readonly BrowserViewPlacement[]) => Promise<void>
) {
    const bounds = new Map<string, BrowserBounds>();
    let focusedViewId: string | null = null;
    const flush = () =>
        send(
            [...bounds].map(([viewId, value]) => ({
                bounds: value,
                focused: viewId === focusedViewId,
                viewId,
            }))
        );
    const focus = (viewId: string | null): Promise<void> => {
        if (focusedViewId === viewId) {
            return Promise.resolve();
        }
        const affected = [focusedViewId, viewId].some((id) => id !== null && bounds.has(id));
        focusedViewId = viewId;
        return affected ? flush() : Promise.resolve();
    };
    return {
        /** Shows `viewId` at `value`, or hides it with null; resolves once Electron applied it. */
        place(viewId: string, value: BrowserBounds | null): Promise<void> {
            if (value) {
                bounds.set(viewId, value);
            } else if (!bounds.delete(viewId)) {
                return Promise.resolve();
            }
            return flush();
        },
        /** Marks the focused pane's web page (or none); page menu actions act on it. */
        focus,
        /** Clears the focus mark only if `viewId` still holds it. */
        blur: (viewId: string): Promise<void> =>
            focusedViewId === viewId ? focus(null) : Promise.resolve(),
    };
}

export type BrowserViewLayout = ReturnType<typeof createBrowserViewLayout>;

/** One per window: Electron's layout is per window. */
export const browserViewLayout = createBrowserViewLayout(
    async (placements) => await getDesktopBridge()?.browserLayout?.(placements)
);
