/**
 * The icons a site names in its page `<head>`, for sites whose `/favicon.ico`
 * is missing or an SPA fallback page rather than an image.
 *
 * Deliberately a small tag scanner, not an HTML parser: only `<link>` tags
 * inside `<head>` matter, their attributes are flat, and anything this misreads
 * still has to pass the same origin check and byte-signature validation as
 * every other icon. A missed icon falls through to the monogram; it can never
 * smuggle in a non-image.
 */

/** Enough of the page to cover any real `<head>`; the rest is never read. */
export const iconPageMaxBytes = 256 * 1024;

/** Each candidate costs a request, so a page cannot fan the resolver out. */
export const iconPageMaxCandidates = 3;

/** Same shape as an advertised icon, so both rank through one function. */
export interface PageIconLink {
    mimeType?: string;
    sizes?: string[];
    src: string;
}

/** `apple-touch-icon` is 180px by convention when it declares no size. */
const appleTouchIconSizes = ['180x180'];

/**
 * Icon `<link>`s in `<head>`, resolved against `pageUrl` and restricted to its
 * origin — the page is fetched from the operator-configured site, but the
 * hrefs inside it are remote-chosen, the same trust class as advertised icons.
 */
export function parsePageIconLinks(html: string, pageUrl: string): PageIconLink[] {
    const head = html.split(/<\/head\s*>/iu)[0] ?? '';
    const links: PageIconLink[] = [];
    for (const match of head.matchAll(/<link\b([^>]*)>/giu)) {
        const link = readIconLink(readAttributes(match[1] ?? ''), pageUrl);
        if (link) {
            links.push(link);
        }
    }
    return links;
}

/** The page whose `<head>` names the site's icons: the favicon's own root. */
export function siteHomeUrl(faviconUrl: null | string): null | string {
    return faviconUrl ? new URL('/', faviconUrl).toString() : null;
}

export function decodePage(bytes: Uint8Array, mediaType: null | string): null | string {
    const type = mediaType?.split(';')[0]?.trim().toLowerCase();
    if (type !== 'text/html' && type !== 'application/xhtml+xml') {
        return null;
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function readIconLink(attributes: Map<string, string>, pageUrl: string): PageIconLink | null {
    const rel = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/u);
    const isAppleTouch = rel.some((token) => token.startsWith('apple-touch-icon'));
    if (!(isAppleTouch || rel.includes('icon'))) {
        return null;
    }
    const src = sameOriginHref(attributes.get('href'), pageUrl);
    if (!src) {
        return null;
    }
    const declaredSizes = attributes.get('sizes')?.trim().split(/\s+/u).filter(Boolean) ?? [];
    const sizes = declaredSizes.length > 0 || !isAppleTouch ? declaredSizes : appleTouchIconSizes;
    const mimeType = linkMimeType(attributes.get('type'), src);
    return {
        src,
        ...(sizes.length > 0 ? { sizes } : {}),
        ...(mimeType ? { mimeType } : {}),
    };
}

/**
 * An extension is the only type hint most `<link>`s carry; naming SVG here
 * lets ranking drop it before it costs a request.
 */
function linkMimeType(declared: string | undefined, src: string): string | undefined {
    const type = declared?.trim();
    if (type) {
        return type;
    }
    return /\.svg(?:[?#]|$)/iu.test(src) ? 'image/svg+xml' : undefined;
}

function sameOriginHref(href: string | undefined, pageUrl: string): null | string {
    if (!href) {
        return null;
    }
    try {
        const page = new URL(pageUrl);
        const resolved = new URL(decodeEntities(href.trim()), page);
        return resolved.protocol === 'https:' && resolved.origin === page.origin
            ? resolved.toString()
            : null;
    } catch {
        return null;
    }
}

function readAttributes(source: string): Map<string, string> {
    const attributes = new Map<string, string>();
    const pattern = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
    for (const match of source.matchAll(pattern)) {
        const name = match[1]?.toLowerCase();
        if (name && !attributes.has(name)) {
            attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
        }
    }
    return attributes;
}

/** Only the entities that realistically appear in an icon href. */
function decodeEntities(value: string): string {
    return value
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&#x2F;', '/');
}
