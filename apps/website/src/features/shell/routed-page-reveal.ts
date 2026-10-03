import { type Location, NavigationType } from 'react-router-dom';

type RoutedLocation = Pick<Location, 'hash' | 'key' | 'pathname' | 'search'>;

/**
 * Whether a navigation should reveal the routed page under a covering tab.
 * A new page, a push, history travel, or a re-navigation to the current URL
 * (a sidebar link replaces the same URL) all do. A replace that only rewrites
 * search or hash is page-state churn (closing a thread peek), and must not hide
 * a tab opened in the same gesture. The first location (mount) reveals too.
 */
export function revealsRoutedPage(
    previous: RoutedLocation | null,
    next: RoutedLocation,
    navigationType: NavigationType
): boolean {
    if (previous === null) {
        return true;
    }
    if (previous.key === next.key) {
        return false;
    }
    if (previous.pathname !== next.pathname || navigationType !== NavigationType.Replace) {
        return true;
    }
    return previous.search === next.search && previous.hash === next.hash;
}

export type AgentAddressHandBack = { kind: 'back' } | { kind: 'replace'; to: string };

/**
 * How an Agent profile address hands the routed page back once its Agent tab
 * opens. A push from an in-app page steps back, so history keeps one entry
 * for that page; anything else (a deep link, a new window, a replace) rewrites
 * the address to the last routed page, or `fallback` when there was none.
 */
export function agentAddressHandBack(
    previous: RoutedLocation | null,
    navigationType: NavigationType,
    { fallback, page }: { fallback: string; page: string | null }
): AgentAddressHandBack {
    if (previous !== null && navigationType === NavigationType.Push) {
        return { kind: 'back' };
    }
    return { kind: 'replace', to: page ?? fallback };
}
