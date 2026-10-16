import { useEffect } from 'react';
import type { AppIcon } from '../../lib/color-themes.ts';
import { getDesktopBridge, type HausDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useColorThemeDefinition } from './use-color-theme.ts';

/**
 * Mounted once, by `ThemeProvider` at the app root: dresses the browser tab
 * and the desktop Dock in the color theme's app icon. The favicon links in
 * `index.html` keep the ghost set; another icon's set lives under its own
 * folder in `public/` with the same file names (`scripts/render-favicon.ts`).
 * The desktop call runs on mount too, so the Dock matches the stored theme at
 * launch.
 */
export function useThemeAppIcon() {
    const { appIcon } = useColorThemeDefinition();

    useEffect(() => {
        applyThemeFavicons(document.querySelectorAll<HTMLLinkElement>(FAVICON_LINKS), appIcon);
    }, [appIcon]);

    useEffect(() => {
        void syncDesktopAppIcon(getDesktopBridge(), appIcon);
    }, [appIcon]);
}

/** Asks the desktop shell, when there is one that can, to wear `icon`. */
export function syncDesktopAppIcon(
    bridge: Pick<HausDesktopBridge, 'setAppIcon'> | null,
    icon: AppIcon
): Promise<void> | undefined {
    return bridge?.setAppIcon?.(icon);
}

/** Where an app icon's favicon set lives, relative to the public root. */
export function faviconDir(icon: AppIcon): string {
    return FAVICON_DIRS[icon];
}

/** The favicon `href` for `icon`, from the link's original (ghost) `href`.
    The folder goes before the file name, so Vite's relative `./` base keeps working. */
export function themeFaviconHref(originalHref: string, icon: AppIcon): string {
    const dir = faviconDir(icon);
    return dir ? originalHref.replace(/[^/]*$/, (file) => `${dir}/${file}`) : originalHref;
}

/** Points each favicon link at `icon`'s set, remembering the original `href`
    on the link so the ghost restores exactly; untouched when already there. */
export function applyThemeFavicons(links: Iterable<FaviconLink>, icon: AppIcon) {
    for (const link of links) {
        const original = link.dataset.hausFavicon ?? link.getAttribute('href');
        if (!original) {
            continue;
        }
        link.dataset.hausFavicon = original;
        const href = themeFaviconHref(original, icon);
        if (link.getAttribute('href') !== href) {
            link.setAttribute('href', href);
        }
    }
}

export type FaviconLink = Pick<HTMLLinkElement, 'dataset' | 'getAttribute' | 'setAttribute'>;

const FAVICON_DIRS: Readonly<Record<AppIcon, string>> = {
    ghost: '',
    pumpkin: 'app-icons/pumpkin',
};

const FAVICON_LINKS = 'link[rel="icon"], link[rel="apple-touch-icon"]';
