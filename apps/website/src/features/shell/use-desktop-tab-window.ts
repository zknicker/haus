import * as React from 'react';
import type { Location } from 'react-router-dom';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { focusedTabId } from '../../hooks/desktop-tabs/desktop-tabs-panes.ts';
import { trackOpenGestures } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { serverRoute } from '../servers/server-routes.ts';
import {
    clickTabId,
    inServerPath,
    newTabLink,
    openNewTabLink,
    preventsMiddlePress,
    relayPlaceClick,
} from './desktop-open-clicks.ts';

/**
 * Where desktop tabs meet the window (ADR 0039). The window hash mirrors the
 * focused tab's page (reload seeding and debugging only; it never drives a
 * tab). A window-router navigation to a page in this Server — code outside
 * every tab router — is Open (the right pane). The window tracks the in-flight
 * click or Return so router pushes from press handlers honor its gesture
 * (`tab-open-gesture.ts`), and owns the capture-phase click rules for the
 * universal modifiers (`desktop-open-clicks.ts`).
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
        if (!inServerPath(windowPath, serverPath)) {
            return;
        }
        if (import.meta.env.DEV) {
            console.warn(
                `[haus] the window router navigated to ${windowPath}; desktop pages route through their tab.`
            );
        }
        latest.current.open(null, { kind: 'app', path: windowPath });
    }, [serverPath, windowPath]);

    React.useEffect(() => trackOpenGestures(window), []);

    React.useEffect(() => {
        const press = (event: MouseEvent) => {
            if (preventsMiddlePress(event)) {
                event.preventDefault();
            }
        };
        const open = (event: MouseEvent) => {
            if (relayPlaceClick(event)) {
                return;
            }
            const link = newTabLink(event, serverPath);
            if (!link) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            openNewTabLink(latest.current, link, clickTabId(event));
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
