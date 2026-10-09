import * as React from 'react';
import { useNavigate } from 'react-router-dom';

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
 */
export function SidebarNavigateProvider({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const latest = React.useRef(navigate);
    React.useLayoutEffect(() => {
        latest.current = navigate;
    });
    const stable = React.useCallback<SidebarNavigate>(
        (href, options) => latest.current(href, options),
        []
    );
    return <SidebarNavigateContext value={stable}>{children}</SidebarNavigateContext>;
}

export function useSidebarNavigate(): SidebarNavigate {
    const navigate = React.use(SidebarNavigateContext);
    if (!navigate) {
        throw new Error('Sidebar rows render inside SidebarNavigateProvider.');
    }
    return navigate;
}
