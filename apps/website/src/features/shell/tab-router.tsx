import * as React from 'react';
import {
    createPath,
    type Navigator,
    parsePath,
    Router,
    type To,
    UNSAFE_DataRouterContext,
    UNSAFE_DataRouterStateContext,
    UNSAFE_LocationContext,
    UNSAFE_NavigationContext,
    UNSAFE_RouteContext,
} from 'react-router-dom';
import type { DesktopTabsApi } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import {
    readTabIntent,
    resolveTabNavigation,
    type TabNavigationPolicy,
} from '../../hooks/desktop-tabs/tab-navigation.ts';
import type { OpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';

/**
 * Per-tab routing (ADR 0039, docs/internals/react.md#shell). The window
 * keeps its hash data router for the Server shell (`/s/:slug`). Each mounted
 * tab — and the shell chrome, bound to the focused pane's current tab —
 * renders under its own controlled `<Router>` whose location is the tab's
 * current history entry and whose navigator dispatches into the tab model. So
 * `useLocation`, `useParams`, `useNavigate`, `<Navigate>`, and `<Link>` inside
 * a page act on its tab with no call-site changes.
 *
 * React Router forbids a `<Router>` inside another; this adapter is the one
 * place that resets the outer router's contexts. It relies on React Router's
 * exported `UNSAFE_*` contexts: a router upgrade must re-run
 * `tab-router.test.tsx`. A declarative `<Router>`'s stock `useNavigate`
 * changes identity on every navigation; the React Router patch keeps it stable
 * here as on the web's data router (`tab-router-stability.test.tsx`).
 */
export function IsolatedTabRouter({
    children,
    entryKey,
    location,
    navigator,
}: {
    children: React.ReactNode;
    /** The history entry key; a new key is a new React Router location. */
    entryKey: string;
    /** An `app` location's path. */
    location: string;
    navigator: Navigator;
}) {
    const routerLocation = React.useMemo(
        () => ({ ...parsePath(location), key: entryKey, state: null }),
        [entryKey, location]
    );
    return (
        <UNSAFE_DataRouterContext.Provider value={null}>
            <UNSAFE_DataRouterStateContext.Provider value={null}>
                <UNSAFE_NavigationContext.Provider value={detachedNavigation}>
                    <UNSAFE_LocationContext.Provider value={detachedLocation}>
                        <UNSAFE_RouteContext.Provider value={detachedRoute}>
                            <Router location={routerLocation} navigator={navigator}>
                                {children}
                            </Router>
                        </UNSAFE_RouteContext.Provider>
                    </UNSAFE_LocationContext.Provider>
                </UNSAFE_NavigationContext.Provider>
            </UNSAFE_DataRouterStateContext.Provider>
        </UNSAFE_DataRouterContext.Provider>
    );
}

/**
 * A navigator for one tab. `policy: 'page'` turns a cross-page push into a
 * link (`openLink`); `policy: 'shell'` goes to a place from the focused pane
 * (`openInFocusedPane` `current`). A push with no stated intent takes the
 * in-flight click's (`gesture`), so Command-, Shift-, or middle-click on any
 * press handler opens a new tab. Paths outside this Server (`/s`, another slug,
 * `/invite/…`) leave the tab model and go to the window router.
 */
export function createTabNavigator(input: {
    current: () => TabLocation;
    gesture: () => OpenGesture;
    policy: TabNavigationPolicy;
    serverPath: string;
    tabId: string;
    tabs: Pick<DesktopTabsApi, 'go' | 'navigate' | 'openInFocusedPane' | 'openLink'>;
    windowNavigate: (path: string, options: { replace: boolean }) => void;
}): Navigator {
    const route = (to: To, state: unknown, mode: 'push' | 'replace') => {
        const path = typeof to === 'string' ? to : createPath(to);
        if (!(path === input.serverPath || path.startsWith(`${input.serverPath}/`))) {
            input.windowNavigate(path, { replace: mode === 'replace' });
            return;
        }
        const location: TabLocation = { kind: 'app', path };
        const stated = readTabIntent(state);
        const outcome = resolveTabNavigation({
            from: input.current(),
            intent: stated === 'auto' && mode === 'push' ? input.gesture() : stated,
            mode,
            policy: input.policy,
            to: location,
        });
        switch (outcome.kind) {
            case 'navigate':
                input.tabs.navigate(input.tabId, location, outcome.mode);
                return;
            case 'openLink':
                input.tabs.openLink(input.tabId, location, outcome.intent);
                return;
            case 'openInFocusedPane':
                input.tabs.openInFocusedPane(location, outcome.intent);
                return;
        }
    };
    return {
        // Electron's window router is a hash router; hrefs must match it so a
        // copied link or a native anchor still resolves.
        createHref: (to) => `#${typeof to === 'string' ? to : createPath(to)}`,
        go: (delta) => input.tabs.go(input.tabId, delta),
        push: (to, state) => route(to, state, 'push'),
        replace: (to, state) => route(to, state, 'replace'),
    };
}

const detachedNavigation = null as unknown as React.ContextType<typeof UNSAFE_NavigationContext>;
const detachedLocation = null as unknown as React.ContextType<typeof UNSAFE_LocationContext>;
const detachedRoute: React.ContextType<typeof UNSAFE_RouteContext> = {
    isDataRoute: false,
    matches: [],
    outlet: null,
};
