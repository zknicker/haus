import { serverChatMessageRoute } from './server-routes.ts';

/**
 * Addresses saved before ADR 0053 deleted Threads — a deep link, a
 * notification, a persisted desktop tab — still resolve. A Thread page
 * (`/s/:slug/threads/:chatId/:anchorMessageId`) or a Chat's `?thread=` or
 * `?claim=` param becomes its parent Channel or DM revealing the Message: the
 * claimed Message when the address names one, else the Thread's anchor, which
 * now carries the old Thread's messages as inline replies. Null for any other
 * address, which needs no redirect.
 */
export function redirectRetiredRoute(location: { pathname: string; search: string }) {
    const params = new URLSearchParams(location.search);
    const page = retiredPagePattern.exec(location.pathname);
    if (page) {
        const [, slug = '', chatId = '', anchorMessageId = ''] = page.map(decodeSegment);
        return messageRoute(slug, chatId, params.get('claim') ?? anchorMessageId);
    }
    const chat = chatPagePattern.exec(location.pathname);
    const messageId = params.get('claim') ?? params.get(retiredChatParam);
    if (!(chat && messageId)) {
        return null;
    }
    const [, slug = '', chatId = ''] = chat.map(decodeSegment);
    return messageRoute(slug, chatId, messageId);
}

const retiredChatParam = 'thread';
const retiredPagePattern = /^\/s\/([^/]+)\/threads\/([^/]+)\/([^/]+)\/?$/u;
const chatPagePattern = /^\/s\/([^/]+)\/chats\/([^/]+)\/?$/u;

function messageRoute(slug: string, chatId: string, messageId: string) {
    return slug && chatId && messageId ? serverChatMessageRoute(slug, chatId, messageId) : null;
}

/** A path segment as its route param reads it; empty when malformed, which redirects nowhere. */
function decodeSegment(segment: string | undefined) {
    try {
        return decodeURIComponent(segment ?? '');
    } catch {
        return '';
    }
}
