import { describe, expect, test } from 'bun:test';
import type { AppIcon } from '../../lib/color-themes.ts';
import { colorThemeDefinition } from '../../lib/color-themes.ts';
import {
    applyThemeFavicons,
    type FaviconLink,
    syncDesktopAppIcon,
    themeFaviconHref,
} from './use-theme-app-icon.ts';

/** A link that records every `href` write, so churn is visible. */
function fakeLink(href: string | null) {
    const attributes = new Map<string, string>(href === null ? [] : [['href', href]]);
    const writes: string[] = [];
    const link = {
        dataset: {} as DOMStringMap,
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => {
            attributes.set(name, value);
            writes.push(value);
        },
    } satisfies FaviconLink;
    return { link, writes };
}

const INDEX_HREFS = [
    '/favicon.svg',
    '/favicon-32.png',
    '/favicon-192.png',
    '/apple-touch-icon.png',
];

describe('theme app icon', () => {
    test('the ghost keeps the index.html set; the pumpkin reads its own folder', () => {
        expect(themeFaviconHref('/favicon.svg', 'ghost')).toBe('/favicon.svg');
        expect(themeFaviconHref('/apple-touch-icon.png', 'pumpkin')).toBe(
            '/app-icons/pumpkin/apple-touch-icon.png'
        );
    });

    test("keeps a relative-base build's './' href relative", () => {
        expect(themeFaviconHref('./favicon.svg', 'pumpkin')).toBe(
            './app-icons/pumpkin/favicon.svg'
        );
    });

    test('swaps every favicon link to the pumpkin and restores the originals', () => {
        const fakes = INDEX_HREFS.map(fakeLink);
        const links = fakes.map((fake) => fake.link);

        applyThemeFavicons(links, colorThemeDefinition('halloween').appIcon);
        expect(links.map((link) => link.getAttribute('href'))).toEqual(
            INDEX_HREFS.map((href) => `/app-icons/pumpkin${href}`)
        );

        applyThemeFavicons(links, colorThemeDefinition('default').appIcon);
        expect(links.map((link) => link.getAttribute('href'))).toEqual(INDEX_HREFS);
    });

    test('leaves links alone when they already show the icon', () => {
        const fake = fakeLink('/favicon.svg');

        applyThemeFavicons([fake.link], 'ghost');
        expect(fake.writes).toEqual([]);

        applyThemeFavicons([fake.link], 'pumpkin');
        applyThemeFavicons([fake.link], 'pumpkin');
        expect(fake.writes).toEqual(['/app-icons/pumpkin/favicon.svg']);
    });

    test('skips a link without an href', () => {
        const fake = fakeLink(null);
        applyThemeFavicons([fake.link], 'pumpkin');
        expect(fake.writes).toEqual([]);
    });

    test("asks the desktop shell for the definition's icon", async () => {
        const calls: AppIcon[] = [];
        const bridge = {
            setAppIcon: async (icon: AppIcon) => {
                calls.push(icon);
            },
        };

        await syncDesktopAppIcon(bridge, colorThemeDefinition('halloween').appIcon);
        await syncDesktopAppIcon(bridge, colorThemeDefinition('default').appIcon);
        expect(calls).toEqual(['pumpkin', 'ghost']);
    });

    test('is a no-op on the web and on a shell without the capability', () => {
        expect(syncDesktopAppIcon(null, 'pumpkin')).toBeUndefined();
        expect(syncDesktopAppIcon({}, 'pumpkin')).toBeUndefined();
    });
});
