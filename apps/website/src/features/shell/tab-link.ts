import type { TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { appLink } from '../servers/server-routes.ts';

/**
 * The tab menu's Copy link: a web page's own address, or an App page's
 * shareable Haus link (the same absolute App URL a copied chat link uses,
 * which opens that page on the web and in the desktop App). The new tab page
 * is no place to share, so it has none.
 */
export function tabLink(location: TabLocation, appOrigin?: string): string | null {
    switch (location.kind) {
        case 'browser':
            return location.url;
        case 'app':
            return appLink(location.path, appOrigin);
        case 'newTab':
            return null;
    }
}
