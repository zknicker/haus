import {
    getArtifactPanelTargetKey,
    type HausResourceTarget,
} from '../../features/chats/haus-resource-link.ts';
import { serverRoute } from '../../features/servers/server-routes.ts';

/** An artifact page always names the Agent whose workspace holds it. */
export type ArtifactPageTarget = HausResourceTarget & { agentId: string };

/**
 * Desktop-only page addresses (ADR 0039): a Thread, a chat's Files, and an
 * Agent's artifact are ordinary pages a tab can show. The web keeps them in the
 * chat side pane and has no such routes. Each second segment names the page,
 * so `tabPageKey` tells two Threads or two artifacts apart.
 */
export function threadPagePath(slug: string, chatId: string, anchorMessageId: string) {
    return `${serverRoute(slug)}/threads/${encodeURIComponent(chatId)}/${encodeURIComponent(anchorMessageId)}`;
}

export function filesPagePath(slug: string, chatId: string) {
    return `${serverRoute(slug)}/files/${encodeURIComponent(chatId)}`;
}

/** `artifacts/<target key>`; the authored title rides the query for the tab label. */
export function artifactPagePath(slug: string, target: ArtifactPageTarget, title?: string) {
    const path = `${serverRoute(slug)}/artifacts/${encodeURIComponent(getArtifactPanelTargetKey(target))}`;
    return title ? `${path}?title=${encodeURIComponent(title)}` : path;
}

/**
 * The window route as the first tab of a window opened on Server `slug`, or
 * null when it names another Server's page (a cached Server switch can render
 * before the window route catches up).
 */
export function windowSeedPath(
    location: { pathname: string; search: string },
    slug: string
): string | null {
    const base = serverRoute(slug);
    const ours = location.pathname === base || location.pathname.startsWith(`${base}/`);
    return ours ? `${location.pathname}${location.search}` : null;
}

/** The inverse of `getArtifactPanelTargetKey` for Agent-bound workspace targets; null when malformed. */
export function parseArtifactPageKey(key: string): ArtifactPageTarget | null {
    const kindEnd = key.indexOf(':');
    const agentEnd = key.indexOf(':', kindEnd + 1);
    if (kindEnd < 1 || agentEnd <= kindEnd + 1) {
        return null;
    }
    const kind = key.slice(0, kindEnd);
    const agentId = key.slice(kindEnd + 1, agentEnd);
    const path = key.slice(agentEnd + 1);
    switch (kind) {
        case 'workspaceFile':
            return path.trim() ? { agentId, kind, path } : null;
        case 'workspaceDirectory':
            return { agentId, kind, path };
        case 'workspaceRoot':
            return path === '' ? { agentId, kind, path } : null;
        default:
            return null;
    }
}
