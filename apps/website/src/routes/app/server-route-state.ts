import type { Chat } from '@haus/api';
import { resolveEntryChat } from '../../features/servers/server-choice.ts';
import {
    serverChatRoute,
    serverRoute,
    serverSettingsRoute,
} from '../../features/servers/server-routes.ts';
import type { SettingsRouteTab } from '../../features/settings/layout/navigation.ts';

/** Top-level routed destinations within one server. */
export type AppSection =
    | 'activity'
    | 'agent'
    | 'artifacts'
    | 'chat'
    | 'issues'
    | 'search'
    | 'settings'
    | 'tasks';

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
    if (suffix.startsWith('/artifacts')) {
        return 'artifacts';
    }
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
    if (suffix.startsWith('/issues')) {
        return 'issues';
    }
    if (suffix.startsWith('/tasks')) {
        return 'tasks';
    }
    if (suffix.startsWith('/activity')) {
        return 'activity';
    }
    if (suffix.startsWith('/search')) {
        return 'search';
    }
    return 'chat';
}

export function resolveSelectedChatId(pathname: string, slug: string) {
    const prefix = `${serverRoute(slug)}/chats/`;
    return pathname.startsWith(prefix)
        ? decodeURIComponent(pathname.slice(prefix.length))
        : undefined;
}

export function resolveSelectedCaptainId(pathname: string, slug: string) {
    const prefix = `${serverRoute(slug)}/captain/`;
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
