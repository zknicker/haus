/** One shared-library artifact a message links to: the stable URL `haus artifact push` prints. */
export interface SharedArtifactLinkTarget {
    artifactId: string;
    revisionId?: string;
}

/** Which links count as this Server's library: the App's own origins and the open Server's slug. */
export interface SharedArtifactLinkScope {
    origins: readonly string[];
    slug: string;
}

const artifactPathPattern = /^\/s\/([^/]+)\/artifacts\/([^/]+)\/?$/u;
const markdownTargetPattern = /\]\(([^)\s]+)\)/gu;
const bareUrlPattern = /https?:\/\/[^\s<>()]+/gu;

/**
 * A stable artifact URL on this App, for the Server that is open. Links to
 * another origin, another Server's slug, or a workspace artifact page (whose
 * key is `kind:agent:path`, never an `art_` id) stay ordinary links.
 */
export function parseSharedArtifactLink(
    href: string,
    scope: SharedArtifactLinkScope
): SharedArtifactLinkTarget | null {
    const url = parseUrl(href, scope.origins[0]);
    if (!(url && scope.origins.includes(url.origin))) {
        return null;
    }
    const match = artifactPathPattern.exec(url.pathname);
    const slug = decodeSegment(match?.[1]);
    const artifactId = decodeSegment(match?.[2]);
    if (!(slug === scope.slug && artifactId?.startsWith('art_')) || artifactId.includes(':')) {
        return null;
    }
    const revisionId = url.searchParams.get('revision')?.trim();
    return revisionId ? { artifactId, revisionId } : { artifactId };
}

/** Every distinct library artifact a message links to, in reading order. */
export function collectSharedArtifactLinks(
    content: string,
    scope: SharedArtifactLinkScope
): SharedArtifactLinkTarget[] {
    const hrefs = [
        ...[...content.matchAll(markdownTargetPattern)].map((match) => ({
            href: match[1] ?? '',
            index: match.index,
        })),
        ...[...content.matchAll(bareUrlPattern)].map((match) => ({
            href: stripTrailingPunctuation(match[0]),
            index: match.index,
        })),
    ].sort((a, b) => a.index - b.index);
    const seen = new Set<string>();
    const targets: SharedArtifactLinkTarget[] = [];
    for (const { href } of hrefs) {
        const target = parseSharedArtifactLink(href, scope);
        const key = target ? sharedArtifactKey(target) : null;
        if (target && key && !seen.has(key)) {
            seen.add(key);
            targets.push(target);
        }
    }
    return targets;
}

export function sharedArtifactKey(target: SharedArtifactLinkTarget) {
    return target.revisionId ? `${target.artifactId}@${target.revisionId}` : target.artifactId;
}

/**
 * The origins a stable URL may carry: the configured App origin (the desktop
 * App has no web origin of its own) and the page's own origin on the web.
 */
export function appOrigins(): string[] {
    const origins = new Set<string>();
    const configured = import.meta.env.VITE_HAUS_APP_ORIGIN;
    if (configured) {
        const url = parseUrl(configured);
        if (url) {
            origins.add(url.origin);
        }
    }
    if (typeof window !== 'undefined' && window.location.origin !== 'null') {
        origins.add(window.location.origin);
    }
    return [...origins];
}

function parseUrl(href: string, base?: string) {
    try {
        // Only root-relative paths resolve against the App; `//host` and bare words do not.
        if (!(/^https?:\/\//u.test(href) || (href.startsWith('/') && !href.startsWith('//')))) {
            return null;
        }
        return base ? new URL(href, base) : new URL(href);
    } catch {
        return null;
    }
}

function decodeSegment(segment: string | undefined) {
    if (!segment) {
        return undefined;
    }
    try {
        return decodeURIComponent(segment);
    } catch {
        return undefined;
    }
}

function stripTrailingPunctuation(value: string) {
    return value.replace(/[.,;:!?]+$/u, '');
}
