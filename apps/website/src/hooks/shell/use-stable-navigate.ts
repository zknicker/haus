import { useCallback, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteHistoryMode } from './same-route-push.ts';

/**
 * The router's `navigate` with one identity for the caller's lifetime, for
 * handing to a context many components read (HeroUI's router and sidebar
 * providers). A desktop shell's navigate changes with the focused tab, and an
 * inline wrapper changes every render; either re-renders every link below.
 * A web push never duplicates the current route (`useRouteHistoryMode`).
 */
export function useStableNavigate(): (href: string) => void {
    const navigate = useNavigate();
    const historyMode = useRouteHistoryMode();
    const latest = useRef({ historyMode, navigate });
    useLayoutEffect(() => {
        latest.current = { historyMode, navigate };
    });
    return useCallback((href: string) => {
        const mode = latest.current.historyMode(href);
        if (mode !== 'skip') {
            latest.current.navigate(href, { replace: mode === 'replace' });
        }
    }, []);
}
