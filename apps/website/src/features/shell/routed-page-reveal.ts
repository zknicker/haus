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
