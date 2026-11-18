import type { Chat } from '@haus/api';
import type { ServerSummary } from '../../lib/haus-server.tsx';

export const lastServerSlugStorageKey = 'haus.last-server-slug';
const lastChatIdStorageKeyPrefix = 'haus.last-chat-id.';

export function resolveEntryServer(
    servers: ServerSummary[],
    lastServerSlug: string | null
): ServerSummary | null {
    if (servers.length === 0) {
        return null;
    }

    return servers.find((server) => server.slug === lastServerSlug) ?? servers[0] ?? null;
}

export function readLastServerSlug(storage: Pick<Storage, 'getItem'> = window.localStorage) {
    return storage.getItem(lastServerSlugStorageKey);
}

export function rememberLastServerSlug(
    slug: string,
    storage: Pick<Storage, 'setItem'> = window.localStorage
) {
    storage.setItem(lastServerSlugStorageKey, slug);
}

export function resolveEntryChat(chats: Chat[], lastChatId: string | null): Chat | null {
    return (
        chats.find((chat) => chat.id === lastChatId) ??
        chats.find((chat) => chat.isAll) ??
        chats[0] ??
        null
    );
}

export function readLastChatId(
    serverSlug: string,
    storage: Pick<Storage, 'getItem'> = window.localStorage
) {
    return storage.getItem(lastChatIdStorageKey(serverSlug));
}

export function rememberLastChatId(
    serverSlug: string,
    chatId: string,
    storage: Pick<Storage, 'setItem'> = window.localStorage
) {
    storage.setItem(lastChatIdStorageKey(serverSlug), chatId);
}

export function parseInvitationToken(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        const url = new URL(trimmed);
        return tokenFromPath(url.pathname);
    } catch {
        return tokenFromPath(trimmed) ?? trimmed;
    }
}

function tokenFromPath(value: string) {
    const match = value.match(/(?:^|\/)invite\/([^/?#]+)/u);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function lastChatIdStorageKey(serverSlug: string) {
    return `${lastChatIdStorageKeyPrefix}${serverSlug}`;
}
