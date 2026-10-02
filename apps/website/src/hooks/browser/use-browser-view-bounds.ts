import { toast } from '@heroui/react';
import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { BrowserBounds, BrowserCapture } from '../../lib/desktop-browser.ts';
import { createBrowserCover } from './browser-cover.ts';

/** A still of the page, sized in CSS pixels to the page region it was captured from. */
export interface BrowserPageSnapshot {
    height: number;
    src: BrowserCapture;
    width: number;
}

const overlaySelector =
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"]';

/**
 * Places a tab's native page view over `host`. Native views paint above DOM, so while a product
 * overlay overlaps the page the view hides and the returned snapshot stands in for it.
 */
export function useBrowserViewBounds(
    host: React.RefObject<HTMLDivElement | null>,
    tabId: string,
    hidden: boolean
): BrowserPageSnapshot | null {
    const [snapshot, setSnapshot] = React.useState<BrowserPageSnapshot | null>(null);
    React.useLayoutEffect(() => {
        const element = host.current;
        const bridge = getDesktopBridge();
        const setBounds = bridge?.browserBounds;
        if (!(element && setBounds)) {
            return;
        }
        const capture = bridge.browserCapture;
        // A release that lands while a snapshot is still decoding must win, or the stale
        // snapshot sticks behind the revealed page.
        let paintRequest = 0;
        const cover = createBrowserCover({
            afterFrame: nextFrame,
            capture: () => (capture ? capture(tabId) : Promise.resolve(null)),
            paint: async (src) => {
                paintRequest += 1;
                const request = paintRequest;
                if (!src) {
                    setSnapshot(null);
                    return;
                }
                const { width, height } = element.getBoundingClientRect();
                await decodeImage(src);
                if (request !== paintRequest) {
                    return;
                }
                setSnapshot({ src, width, height });
                await nextFrame();
                await nextFrame();
            },
            place: setBounds,
        });
        let frame = 0;
        let reportedFailure = false;
        const report = (error: Error) => {
            if (!reportedFailure) {
                reportedFailure = true;
                toast.danger('Browser view unavailable', { description: error.message });
            }
        };
        const resize = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const rect = element.getBoundingClientRect();
                const overlay = [...document.querySelectorAll(overlaySelector)].some((node) =>
                    overlaps(node, rect)
                );
                const request = cover.update({
                    bounds: pageBounds(element, rect),
                    hidden,
                    overlay,
                });
                void request?.catch(report);
            });
        };
        const observer = new ResizeObserver(resize);
        const overlays = new MutationObserver((mutations) => {
            if (mutations.some(affectsOverlay)) {
                resize();
            }
        });
        const shellVariant = new MutationObserver(resize);
        observer.observe(element);
        overlays.observe(document.body, { childList: true, subtree: true });
        shellVariant.observe(document.documentElement, {
            attributeFilter: ['data-shell-variant'],
        });
        window.addEventListener('resize', resize);
        resize();
        return () => {
            cancelAnimationFrame(frame);
            cover.dispose();
            observer.disconnect();
            overlays.disconnect();
            shellVariant.disconnect();
            window.removeEventListener('resize', resize);
            void setBounds(null).catch(report);
        };
    }, [host, tabId, hidden]);
    return snapshot;
}

function pageBounds(element: HTMLElement, rect: DOMRect): BrowserBounds {
    const radius = shellCardRadius(element);
    const bounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    return radius > 0 ? { ...bounds, radius } : bounds;
}

/**
 * The rounded shell card's inner corner (Canvas and Band window layouts) in CSS px,
 * so the native view clips like the DOM around it; 0 in the square shipped
 * shell. The card is the content column in canvas and the whole AppLayout in
 * band; the page touches the card's bottom-end corner, so that is the radius
 * read (in band, the bottom corner minus the card border).
 * Electron rounds a view's corners uniformly, so the page's other
 * three corners round too, over the white page ground: invisible on light
 * sites, small white notches on dark ones. Accepted over a
 * square corner poking past the card onto the canvas.
 */
function shellCardRadius(element: HTMLElement) {
    for (const card of [element.closest('.app-shell-main'), element.closest('[data-app-layout]')]) {
        if (!card) {
            continue;
        }
        const style = getComputedStyle(card);
        const radius =
            Number.parseFloat(style.borderEndEndRadius) -
            Number.parseFloat(style.borderInlineEndWidth);
        if (Number.isFinite(radius) && radius > 0) {
            return radius;
        }
    }
    return 0;
}

function overlaps(node: Element, rect: DOMRect) {
    const overlayRect = node.getBoundingClientRect();
    return (
        node.getClientRects().length > 0 &&
        overlayRect.bottom > rect.top &&
        overlayRect.top < rect.bottom &&
        overlayRect.right > rect.left &&
        overlayRect.left < rect.right
    );
}

function nextFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function decodeImage(src: string) {
    const image = new Image();
    image.src = src;
    // A decode failure still renders as a broken image at worst; the native view hides regardless.
    await image.decode().catch(() => undefined);
}

function affectsOverlay(mutation: MutationRecord) {
    if (mutation.target instanceof Element && mutation.target.closest(overlaySelector)) {
        return true;
    }
    return [...mutation.addedNodes, ...mutation.removedNodes].some(
        (node) =>
            node instanceof Element &&
            (node.matches(overlaySelector) || node.querySelector(overlaySelector) !== null)
    );
}
