import * as React from 'react';
import { parsePath, useLocation, useNavigate } from 'react-router-dom';
import { useOptionalDesktopTabs } from '../desktop-tabs/desktop-tabs-context.ts';

export type SidebarNavigate = (
    href: string,
    options?: { flushSync?: boolean; replace?: boolean }
) => void;

const SidebarNavigateContext = React.createContext<SidebarNavigate | null>(null);

/**
 * One navigate for the sidebar's rows and menus that never changes. Router
 * hooks re-render their caller on every location change, and a desktop tab
 * switch moves the location, so every row read through `useNavigate`
 * re-rendered on each switch. The provider reads the router once; rows read
 * this context.
 *
 * On the web a push to the route the window already shows is skipped, so
 * Back never lands on a duplicate entry. Desktop tabs already make that push
 * a no-op against the left pane's tab, which chrome navigates (ADR 0039).
 */
export function SidebarNavigateProvider({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const tabs = useOptionalDesktopTabs();
    const latest = React.useRef({ location, navigate, tabs });
    React.useLayoutEffect(() => {
        latest.current = { location, navigate, tabs };
    });
    const stable = React.useCallback<SidebarNavigate>((href, options) => {
        const current = latest.current;
        if (!(current.tabs || options?.replace) && isCurrentRoute(current.location, href)) {
            return;
        }
        current.navigate(href, options);
    }, []);
    return <SidebarNavigateContext value={stable}>{children}</SidebarNavigateContext>;
}

export function useSidebarNavigate(): SidebarNavigate {
    const navigate = React.use(SidebarNavigateContext);
    if (!navigate) {
        throw new Error('Sidebar rows render inside SidebarNavigateProvider.');
    }
    return navigate;
}

function isCurrentRoute(location: { pathname: string; search: string }, href: string) {
    const target = parsePath(href);
    return (
        (target.pathname ?? location.pathname) === location.pathname &&
        (target.search ?? '') === location.search
    );
}
