import type { DesktopTabCommands } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import {
    openIntentFromEvent,
    opensPlaceAttribute,
} from '../../hooks/desktop-tabs/tab-open-gesture.ts';

/**
 * The window's capture-phase click rules for the universal modifiers (ADR 0039), pure over
 * the event so they test without a DOM:
 *
 * - A modified click on an in-Server link (an anchor, or a React Aria item's `data-href`)
 *   opens a tab beside the link's own tab (`newTabLink`, `openNewTabLink`).
 * - A middle click on any press target marked `data-opens-place` (`opensPlace`) is relayed
 *   as a click, so its own handler runs with the background-tab gesture (`relayPlaceClick`).
 * - A middle press never starts autoscroll (`preventsMiddlePress`).
 */

/** The in-Server page a new-tab gesture on a link names, and that gesture; else null. */
export function newTabLink(
    event: MouseEvent,
    serverPath: string
): { background: boolean; location: TabLocation } | null {
    const gesture = openIntentFromEvent(event);
    if (event.defaultPrevented || gesture === 'auto') {
        return null;
    }
    if (event.type === 'auxclick' && event.button !== 1) {
        return null;
    }
    // React Aria opens its own `data-href` items on a left click (a synthetic anchor click
    // this handler sees); only the middle button needs catching on the item itself.
    const path = inServerLinkPath(event.target, serverPath, event.type === 'auxclick');
    return path
        ? { background: gesture === 'backgroundTab', location: { kind: 'app', path } }
        : null;
}

/** A new-tab link opens beside its own tab, or from window chrome beside the left pane's. */
export function openNewTabLink(
    tabs: Pick<DesktopTabCommands, 'openTab'>,
    link: { background: boolean; location: TabLocation },
    fromTabId: string | null
) {
    tabs.openTab(fromTabId, link.location, { background: link.background });
}

/**
 * The tab a click landed in: `data-desktop-tab-id` on its frame, or `data-source-tab-id` on a
 * page-owned sidebar (the Settings rail); null in window chrome.
 */
export function clickTabId(event: Pick<Event, 'target'>): string | null {
    const target = event.target as Partial<Element> | null;
    const frame = target?.closest?.('[data-desktop-tab-id], [data-source-tab-id]') ?? null;
    return (
        frame?.getAttribute('data-desktop-tab-id') ??
        frame?.getAttribute('data-source-tab-id') ??
        null
    );
}

/**
 * A middle `auxclick` on a `data-opens-place` target: clicks it and returns true. Its click
 * handler runs inside this auxclick, so a push or opener reads the background-tab gesture.
 */
export function relayPlaceClick(
    event: Pick<MouseEvent, 'button' | 'preventDefault' | 'target' | 'type'>
): boolean {
    const place = event.type === 'auxclick' && event.button === 1 ? placeTarget(event) : null;
    if (!place) {
        return false;
    }
    event.preventDefault();
    place.click();
    return true;
}

/** A middle press anywhere in the App must not start autoscroll (or paste). */
export function preventsMiddlePress(event: Pick<MouseEvent, 'button'>): boolean {
    return event.button === 1;
}

/** The in-Server path of the link around `target`: an anchor, or a React Aria item's `data-href`. */
function inServerLinkPath(
    target: EventTarget | null,
    serverPath: string,
    items = true
): string | null {
    const element = target as Partial<Element> | null;
    const link = element?.closest?.(items ? 'a[href], [data-href]' : 'a[href]') ?? null;
    const href = link?.getAttribute('href') ?? link?.getAttribute('data-href') ?? '';
    // Tab routers write hash hrefs; HeroUI links carry the raw route.
    const path = href.startsWith('#/') ? href.slice(1) : href.startsWith('/') ? href : null;
    return path && inServerPath(path, serverPath) ? path : null;
}

function placeTarget(event: Pick<Event, 'target'>): HTMLElement | null {
    const target = event.target as Partial<Element> | null;
    return target?.closest?.<HTMLElement>(`[${opensPlaceAttribute}]`) ?? null;
}

export function inServerPath(path: string, serverPath: string) {
    const pathname = path.split(/[?#]/u)[0] ?? '';
    return pathname === serverPath || pathname.startsWith(`${serverPath}/`);
}
