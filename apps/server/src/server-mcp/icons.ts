import { type McpIcon, mcpIconSchema } from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import * as z from 'zod';
import { encodeFetchedIcon, iconMediaTypes, readDataUrl } from './icon-encoding.ts';
import { loadRemoteIcon, type McpIconFetch } from './icon-loader.ts';
import {
    decodePage,
    iconPageMaxBytes,
    iconPageMaxCandidates,
    parsePageIconLinks,
    siteHomeUrl,
} from './icon-page-links.ts';

export type { McpIconFetch } from './icon-loader.ts';

/**
 * Resolving a connection's icon to inline bytes, at discovery time.
 *
 * Three sources, in order: the icons an MCP server advertises in `serverInfo`
 * (SEP-973), then the `/favicon.ico` of the site behind its host, then the
 * icon `<link>`s on that site's home page — for SPAs whose `/favicon.ico` is
 * an HTML fallback rather than an image. All are fetched
 * here, by Haus Server, once per refresh — never by the App. An `img` in the
 * App pointed at a connection's own host would report the viewer's IP and page
 * views back to that operator, which is exactly the tracking channel this
 * module exists to close.
 *
 * The upstream `Icon` shape stays local to this file: it is a third-party
 * protocol shape, not a Haus contract. What crosses `@haus/api` is the
 * validated, inlined result.
 */

/** The MCP spec's icon metadata. `sizes` is `"48x48"`-style, or `"any"`. */
const upstreamIconSchema = z
    .object({
        mimeType: z.string().optional(),
        sizes: z.array(z.string()).optional(),
        src: z.string(),
        theme: z.enum(['dark', 'light']).optional(),
    })
    .loose();

type UpstreamIcon = z.infer<typeof upstreamIconSchema>;

/** What ranking reads: an advertised icon or a page `<link>` both fit. */
type RankableIcon = Pick<UpstreamIcon, 'mimeType' | 'sizes'>;

const upstreamIconsSchema = z.array(upstreamIconSchema).max(24);

/** Rows render around 32px; at 2x DPR anything from 64px up is plenty. */
const preferredMinimumPixels = 64;

/** Hosts prefixed with a service label usually front a site that has a favicon. */
const serviceHostLabels = new Set(['api', 'connect', 'mcp', 'remote', 'server']);

export interface McpIconResolverInput {
    connectionUrl: string;
    fetchImpl?: McpIconFetch;
    serverInfoIcons: unknown;
    timeoutMs: number;
}

export type McpIconResolver = (input: McpIconResolverInput) => Promise<McpIcon | null>;

export function makeMcpIconResolver(runtime: EffectRuntime<never>): McpIconResolver {
    return async (input) => {
        return await resolveMcpIcon(runtime, input);
    };
}

async function resolveMcpIcon(
    runtime: EffectRuntime<never>,
    input: McpIconResolverInput
): Promise<McpIcon | null> {
    const fetchImpl = input.fetchImpl ?? defaultIconFetch;
    const advertised = await resolveAdvertisedIcon(runtime, { ...input, fetchImpl });
    if (advertised) {
        return advertised;
    }
    const faviconUrl = siteFaviconUrl(input.connectionUrl);
    const favicon =
        (await loadRemoteIcon(runtime, {
            encode: encodeFetchedIcon,
            fetchImpl,
            timeoutMs: input.timeoutMs,
            url: faviconUrl,
        })) ??
        (await resolvePageIcon(runtime, { faviconUrl, fetchImpl, timeoutMs: input.timeoutMs }));
    return favicon ? asIcon({ dark: favicon, light: favicon }) : null;
}

async function resolvePageIcon(
    runtime: EffectRuntime<never>,
    input: { faviconUrl: null | string; fetchImpl: McpIconFetch; timeoutMs: number }
): Promise<string | null> {
    const pageUrl = siteHomeUrl(input.faviconUrl);
    if (!pageUrl) {
        return null;
    }
    const html = await loadRemoteIcon(runtime, {
        encode: decodePage,
        fetchImpl: input.fetchImpl,
        limit: { maxBytes: iconPageMaxBytes, overflow: 'truncate' },
        timeoutMs: input.timeoutMs,
        url: pageUrl,
    });
    if (!html) {
        return null;
    }
    const candidates = rankIcons(parsePageIconLinks(html, pageUrl))
        .filter((link) => link.src !== input.faviconUrl)
        .slice(0, iconPageMaxCandidates);
    for (const candidate of candidates) {
        const loaded = await loadRemoteIcon(runtime, {
            encode: encodeFetchedIcon,
            fetchImpl: input.fetchImpl,
            timeoutMs: input.timeoutMs,
            url: candidate.src,
        });
        if (loaded) {
            return loaded;
        }
    }
    return null;
}

async function resolveAdvertisedIcon(
    runtime: EffectRuntime<never>,
    input: {
        connectionUrl: string;
        fetchImpl: McpIconFetch;
        serverInfoIcons: unknown;
        timeoutMs: number;
    }
): Promise<McpIcon | null> {
    const parsed = upstreamIconsSchema.safeParse(input.serverInfoIcons);
    if (!parsed.success || parsed.data.length === 0) {
        return null;
    }
    // An untagged icon sits in both theme buckets; without this it would be
    // fetched once per bucket.
    const loads = new Map<string, Promise<string | null>>();
    const context = { ...input, loads };
    const [light, dark] = await Promise.all([
        loadVariant(runtime, parsed.data, 'light', context),
        loadVariant(runtime, parsed.data, 'dark', context),
    ]);
    return asIcon({ dark: dark ?? light, light: light ?? dark });
}

async function loadVariant(
    runtime: EffectRuntime<never>,
    icons: UpstreamIcon[],
    theme: 'dark' | 'light',
    input: {
        connectionUrl: string;
        fetchImpl: McpIconFetch;
        loads: Map<string, Promise<string | null>>;
        timeoutMs: number;
    }
): Promise<string | null> {
    // An untagged icon serves both themes, so it stays in every bucket.
    const candidates = rankIcons(icons.filter((icon) => (icon.theme ?? theme) === theme));
    for (const candidate of candidates) {
        const pending =
            input.loads.get(candidate.src) ??
            (candidate.src.startsWith('data:')
                ? Promise.resolve(readDataUrl(candidate.src))
                : loadRemoteIcon(runtime, {
                      encode: encodeFetchedIcon,
                      fetchImpl: input.fetchImpl,
                      timeoutMs: input.timeoutMs,
                      url: sameOriginIconUrl(candidate.src, input.connectionUrl),
                  }));
        input.loads.set(candidate.src, pending);
        const loaded = await pending;
        if (loaded) {
            return loaded;
        }
    }
    return null;
}

/**
 * Smallest that still covers a retina row, first. Candidates declaring a media
 * type we do not accept are dropped here rather than fetched and rejected —
 * an SVG-only server should cost zero requests, not one per theme.
 */
function rankIcons<Icon extends RankableIcon>(icons: Icon[]): Icon[] {
    return icons
        .filter((icon) => !icon.mimeType || iconMediaTypes.has(icon.mimeType.toLowerCase()))
        .sort((left, right) => iconRank(left) - iconRank(right));
}

function iconRank(icon: RankableIcon): number {
    const pixels = largestDeclaredPixels(icon);
    if (pixels === 'any') {
        return 0;
    }
    if (pixels === null) {
        return 2;
    }
    return pixels >= preferredMinimumPixels ? 1 + pixels / 100_000 : 3 - pixels / 100_000;
}

function largestDeclaredPixels(icon: RankableIcon): 'any' | null | number {
    if (!icon.sizes || icon.sizes.length === 0) {
        return null;
    }
    if (icon.sizes.some((size) => size.trim().toLowerCase() === 'any')) {
        return 'any';
    }
    const widths = icon.sizes
        .map((size) => Number.parseInt(size.trim().toLowerCase().split('x')[0] ?? '', 10))
        .filter((width) => Number.isFinite(width) && width > 0);
    return widths.length > 0 ? Math.max(...widths) : null;
}

/**
 * An icon URL is chosen by the remote server, which is a lower trust class than
 * the operator-configured connection URL. Restricting it to the connection's own
 * origin removes the SSRF surface outright; servers that host icons elsewhere
 * simply fall through to the favicon step.
 */
function sameOriginIconUrl(src: string, connectionUrl: string): null | string {
    try {
        const icon = new URL(src);
        const connection = new URL(connectionUrl);
        if (icon.protocol !== 'https:' || icon.origin !== connection.origin) {
            return null;
        }
        return icon.toString();
    } catch {
        return null;
    }
}

/**
 * MCP endpoints are API hosts, not websites: of six real remote MCP servers
 * checked, one served a favicon at its own origin while four served one from
 * the site behind it (`mcp.linear.app` -> `linear.app`).
 *
 * This is a heuristic, not a public-suffix lookup. Testing the leading label
 * happens to leave `example.co.uk` alone, but a connection on a shared
 * platform host (`mcp.vercel.app`, `api.onrender.com`) will strip to the
 * platform apex and show the platform's mark. Harmless — a public favicon,
 * no user data — but wrong, and the fix would be a real suffix list.
 */
export function siteFaviconUrl(connectionUrl: string): null | string {
    try {
        const { hostname, protocol } = new URL(connectionUrl);
        if (protocol !== 'https:') {
            return null;
        }
        const labels = hostname.split('.');
        const site =
            labels.length > 2 && serviceHostLabels.has(labels[0])
                ? labels.slice(1).join('.')
                : hostname;
        return `https://${site}/favicon.ico`;
    } catch {
        return null;
    }
}

function asIcon(candidate: { dark: null | string; light: null | string }): McpIcon | null {
    // One icon serving both themes is stored once; the App falls back to the
    // light variant. `mcp.list` returns every connection's icon inline, so
    // storing the same bytes twice would double that payload for no gain.
    const deduped =
        candidate.dark === candidate.light ? { dark: null, light: candidate.light } : candidate;
    const parsed = mcpIconSchema.safeParse(deduped);
    return parsed.success ? parsed.data : null;
}

/**
 * Redirects are refused rather than followed: a same-origin icon URL that
 * bounces elsewhere would defeat the origin check that keeps this fetch from
 * becoming an SSRF probe. Exported so a test can pin it.
 */
export const iconRequestInit = { redirect: 'error' } as const satisfies RequestInit;

async function defaultIconFetch(url: string, signal: AbortSignal): Promise<Response> {
    return await globalThis.fetch(url, { ...iconRequestInit, signal });
}
