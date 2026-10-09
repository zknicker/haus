import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * The router's `navigate` with one identity for the caller's lifetime, for
 * handing to a context many components read (HeroUI's router and sidebar
 * providers). A desktop shell's navigate changes with the focused tab, and an
 * inline wrapper changes every render; either re-renders every link below.
 */
export function useStableNavigate(): (href: string) => void {
    const navigate = useNavigate();
    const latest = useRef(navigate);
    latest.current = navigate;
    return useCallback((href: string) => {
        latest.current(href);
    }, []);
}
