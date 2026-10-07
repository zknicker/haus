import type { Chat } from '@haus/api';
import { resolveAgentSectionParam } from '../../features/members/agent-profile/agent-section-route.ts';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import { resolveEntryChat } from '../../features/servers/server-choice.ts';
import {
    serverChatRoute,
    serverRoute,
    serverSettingsRoute,
} from '../../features/servers/server-routes.ts';
import type { SettingsRouteTab } from '../../features/settings/layout/navigation.ts';

/** Top-level routed destinations within one server. */
export type AppSection = 'activity' | 'agent' | 'chat' | 'inbox' | 'search' | 'settings' | 'tasks';

/**
 * Only Settings replaces the sidebar. Everywhere else the chat navigation
 * stays put, so moving between destinations never costs you your place — a
 * page's own filters belong on the page, not in swapped-out navigation.
 */
export function resolveSidebarPage(active: AppSection) {
    return active === 'settings' ? 'settings' : 'server';
}

export function resolveChatSectionRoute(chats: Chat[], lastChatId: string | null, slug: string) {
    const chat = resolveEntryChat(chats, lastChatId);
    return chat ? serverChatRoute(slug, chat.id) : serverRoute(slug);
}

export function resolveActiveSection(pathname: string, slug: string): AppSection {
    const suffix = pathname.slice(serverRoute(slug).length);
    // An Agent's page is its own destination, and it keeps the chat navigation.
    if (suffix.startsWith('/agents/')) {
        return 'agent';
    }
    // The members browser is gone: a member is a record in Settings.
    if (suffix.startsWith('/members')) {
        return 'settings';
    }
    if (suffix.startsWith('/computers')) {
        return 'settings';
    }
    if (suffix.startsWith('/settings')) {
        return 'settings';
    }
    if (suffix.startsWith('/tasks')) {
        return 'tasks';
    }
    if (suffix.startsWith('/activity')) {
        return 'activity';
    }
    if (suffix.startsWith('/inbox')) {
        return 'inbox';
    }
    if (suffix.startsWith('/search')) {
        return 'search';
    }
    return 'chat';
}

/**
 * The Agent an address opens — its profile route, the retired members
 * address, or its old Settings address — or null. Desktop opens it as an Agent
 * tab instead of routing to it; every one of these routes renders nothing there.
 */
export function resolveAgentProfileTarget(
    pathname: string,
    slug: string
): { agentId: string; section: AgentSection } | null {
    const suffix = pathname.slice(serverRoute(slug).length);
    const match = /^\/(?:(?:settings\/)?members\/)?agents\/([^/]+)(?:\/([^/]+))?/.exec(suffix);
    if (!(pathname.startsWith(serverRoute(slug)) && match?.[1])) {
        return null;
    }
    const agentId = decodeSegment(match[1]);
    return agentId === null
        ? null
        : { agentId, section: resolveAgentSectionParam(match[2]).section };
}

export function resolveSelectedChatId(pathname: string, slug: string) {
    const prefix = `${serverRoute(slug)}/chats/`;
    return pathname.startsWith(prefix)
        ? decodeURIComponent(pathname.slice(prefix.length))
        : undefined;
}

export function resolveSelectedAgentDmId(pathname: string, slug: string) {
    const prefix = `${serverRoute(slug)}/dm/`;
    return pathname.startsWith(prefix)
        ? decodeURIComponent(pathname.slice(prefix.length))
        : undefined;
}

export function resolveSettingsSection(
    pathname: string,
    slug: string
): SettingsRouteTab | undefined {
    const prefix = `${serverSettingsRoute(slug)}/`;
    if (!pathname.startsWith(prefix)) {
        return undefined;
    }
    const section = decodeURIComponent(pathname.slice(prefix.length)).split('/')[0];
    return section ? (section as SettingsRouteTab) : undefined;
}

/** A malformed escape (`%E0`) names no Agent rather than throwing mid-render. */
function decodeSegment(segment: string) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return null;
    }
}
