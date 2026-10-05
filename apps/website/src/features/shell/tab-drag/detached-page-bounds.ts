import { pageBounds } from '../../../hooks/browser/use-browser-view-bounds.ts';
import type { BrowserBounds } from '../../../lib/desktop-browser.ts';

/**
 * Where a torn-off tab's web page will sit in its new window (ADR 0039), so
 * Electron can show the live page there before that window's App boots: the
 * new window has this one's size and one pane, so the page fills the whole
 * pane stage, inset by its own toolbar as measured on a page here. Prefers the
 * dragged tab's own page; any shown page has the same insets. Null when no
 * page is on screen to measure; the page then waits for the App to place it.
 */
export function detachedPageBounds(document: Document, tabId: string): BrowserBounds | null {
    const stage = document.querySelector('.desktop-panes');
    const host = [
        document.querySelector(
            `.desktop-tab-frame[data-desktop-tab-id="${CSS.escape(tabId)}"] [data-browser-view-host]`
        ),
        ...document.querySelectorAll('[data-browser-view-host]'),
    ].find((element): element is HTMLElement => element instanceof HTMLElement && hasArea(element));
    const frame = host?.closest('.desktop-tab-frame');
    if (!(stage && host && frame)) {
        return null;
    }
    const stageRect = stage.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const top = stageRect.y + (hostRect.top - frameRect.top);
    const left = stageRect.x + (hostRect.left - frameRect.left);
    const width = stageRect.width - (frameRect.width - hostRect.width);
    const height = stageRect.height - (frameRect.height - hostRect.height);
    if (!(width > 0 && height > 0 && top >= 0 && left >= 0)) {
        return null;
    }
    return pageBounds(host, { height, width, x: left, y: top });
}

function hasArea(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}
