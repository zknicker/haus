import * as React from 'react';
import type { Location } from 'react-router-dom';
import {
    type DesktopTabsApi,
    useDesktopTabs,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentLocation, type TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { focusedTabId } from '../../hooks/desktop-tabs/desktop-tabs-panes.ts';
import {
    openIntentFromEvent,
    opensPlaceAttribute,
    trackOpenGestures,
} from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { serverRoute } from '../servers/server-routes.ts';

/**
 * Where desktop tabs meet the window (ADR 0039). The window hash mirrors the
 * focused tab's page (reload seeding and debugging only; it never drives a
 * tab). A window-router navigation to a page in this Server — code outside
 * every tab router — reveals that page instead. A new-tab gesture on an in-app
 * link (an anchor, or a React Aria item's `data-href`) opens a new tab after the
 * link's tab, or from window chrome after the focused pane's current tab:
 * background for Command- or middle-click, selected with Shift.
 * The window also tracks the in-flight click so router pushes from press
 * handlers honor the same gesture (`tab-open-gesture.ts`).
 */
export function useDesktopTabWindow(windowLocation: Location, slug: string) {
    const tabs = useDesktopTabs();
    const latest = React.useRef(tabs);
    latest.current = tabs;
    const serverPath = serverRoute(slug);

    const focusedId = focusedTabId(tabs.state);
    const focusedTab = focusedId ? tabs.tab(focusedId) : null;
    const focused = focusedTab ? currentLocation(focusedTab) : null;
    const mirrorPath = focused?.kind === 'app' ? focused.path : null;
    React.useEffect(() => {
        if (mirrorPath && window.location.hash !== `#${mirrorPath}`) {
            // `replaceState` keeps the router's own state and fires no router update.
            window.history.replaceState(window.history.state, '', `#${mirrorPath}`);
        }
    }, [mirrorPath]);

    const windowPath = `${windowLocation.pathname}${windowLocation.search}`;
    const seenWindowPath = React.useRef(windowPath);
    React.useEffect(() => {
        if (seenWindowPath.current === windowPath) {
            return;
        }
        seenWindowPath.current = windowPath;
        if (!inServer(windowPath, serverPath)) {
            return;
        }
        if (import.meta.env.DEV) {
            console.warn(
                `[haus] the window router navigated to ${windowPath}; desktop pages route through their tab.`
            );
        }
        latest.current.reveal({ kind: 'app', path: windowPath });
    }, [serverPath, windowPath]);

    React.useEffect(() => trackOpenGestures(window), []);

    React.useEffect(() => {
        // A middle press on an in-app link or place must not start autoscroll or paste.
        const press = (event: MouseEvent) => {
            if (
                event.button === 1 &&
                (inServerLinkPath(event.target, serverPath) || placeTarget(event))
            ) {
                event.preventDefault();
            }
        };
        const open = (event: MouseEvent) => {
            const place = event.type === 'auxclick' && event.button === 1 && placeTarget(event);
            if (place) {
                event.preventDefault();
                // Its click handler runs inside this auxclick, so the push reads a new-tab gesture.
                place.click();
                return;
            }
            const link = newTabLink(event, serverPath);
            if (!link) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const from = (event.target as Element).closest<HTMLElement>('[data-desktop-tab-id]');
            openNewTabLink(latest.current, link, from?.dataset.desktopTabId);
        };
        document.addEventListener('mousedown', press, true);
        document.addEventListener('click', open, true);
        document.addEventListener('auxclick', open, true);
        return () => {
            document.removeEventListener('mousedown', press, true);
            document.removeEventListener('click', open, true);
            document.removeEventListener('auxclick', open, true);
        };
    }, [serverPath]);
}

/** The in-Server page a new-tab gesture on a link names, and that gesture; else null. */
export function newTabLink(
    event: MouseEvent,
    serverPath: string
): { intent: 'backgroundTab' | 'newTab'; location: TabLocation } | null {
    const intent = openIntentFromEvent(event);
    if (event.defaultPrevented || intent === 'auto') {
        return null;
    }
    if (event.type === 'auxclick' && event.button !== 1) {
        return null;
    }
    // React Aria opens its own `data-href` items on a left click (a synthetic anchor click
    // this handler sees); only the middle button needs catching on the item itself.
    const path = inServerLinkPath(event.target, serverPath, event.type === 'auxclick');
    return path ? { intent, location: { kind: 'app', path } } : null;
}

/**
 * A new-tab link opens from its tab (`openLink`) or, from window chrome (a sidebar row, a
 * React Aria item's synthetic anchor), from the focused pane; either way it keeps the gesture.
 */
export function openNewTabLink(
    tabs: Pick<DesktopTabsApi, 'openInFocusedPane' | 'openLink'>,
    link: { intent: 'backgroundTab' | 'newTab'; location: TabLocation },
    fromTabId: string | undefined
) {
    if (fromTabId) {
        tabs.openLink(fromTabId, link.location, link.intent);
    } else {
        tabs.openInFocusedPane(link.location, link.intent);
    }
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
    return path && inServer(path, serverPath) ? path : null;
}

function placeTarget(event: MouseEvent): HTMLElement | null {
    const target = event.target as Partial<Element> | null;
    return target?.closest?.<HTMLElement>(`[${opensPlaceAttribute}]`) ?? null;
}

function inServer(path: string, serverPath: string) {
    const pathname = path.split(/[?#]/u)[0] ?? '';
    return pathname === serverPath || pathname.startsWith(`${serverPath}/`);
}
