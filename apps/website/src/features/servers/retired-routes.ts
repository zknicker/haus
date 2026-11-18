import { serverChatMessageRoute } from './server-routes.ts';

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

function decodeSegment(segment: string | undefined) {
    try {
        return decodeURIComponent(segment ?? '');
    } catch {
        return '';
    }
}
