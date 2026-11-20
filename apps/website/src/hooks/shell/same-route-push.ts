import * as React from 'react';
import { createPath, type Path, resolvePath } from 'react-router-dom';
import { useOptionalDesktopTabs } from '../desktop-tabs/desktop-tabs-context.ts';
import { useAppRouter } from './app-router-context.ts';

export function useRouteHistoryMode() {
    const desktop = useOptionalDesktopTabs() !== null;
    const router = useAppRouter();
    return React.useCallback(
        (href: string, replace?: boolean) => {
            if (replace) {
                return 'replace';
            }
            if (desktop || !router) {
                return 'push';
            }
            const { location, navigation } = router.state;
            if (isSameRoute(navigation.location ?? location, href)) {
                return 'skip';
            }
            return isSameRoute(location, href) ? 'replace' : 'push';
        },
        [desktop, router]
    );
}

function isSameRoute({ hash, pathname, search }: Path, href: string) {
    return createPath(resolvePath(href, pathname)) === createPath({ hash, pathname, search });
}
