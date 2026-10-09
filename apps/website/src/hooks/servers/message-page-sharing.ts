import type { ChatMessage } from '@haus/api';
import { replaceEqualDeep } from '@tanstack/react-query';

interface MessagePages {
    pages: readonly { messages: readonly ChatMessage[] }[];
}

/**
 * React Query structural sharing for paged transcripts, by message id.
 *
 * The default shares by array index. A newest page is a sliding window, so a
 * new message shifts every loaded message one index and the default hands back
 * a new object for each of them. The transcript treats message identity as its
 * change signal (`projectStableChatMessages`), so that re-rendered every row on
 * every message. Matching by id keeps each unchanged message the object the
 * transcript already rendered.
 */
export function shareMessagePages(previous: unknown, next: unknown): unknown {
    const shared = replaceEqualDeep(previous, next);
    if (shared === previous || !(isMessagePages(previous) && isMessagePages(shared))) {
        return shared;
    }
    const previousById = new Map<string, ChatMessage>();
    for (const page of previous.pages) {
        for (const message of page.messages) {
            previousById.set(message.id, message);
        }
    }
    let changed = false;
    const pages = shared.pages.map((page) => {
        let pageChanged = false;
        const messages = page.messages.map((message) => {
            const earlier = previousById.get(message.id);
            if (earlier === undefined || earlier === message) {
                return message;
            }
            if (replaceEqualDeep(earlier, message) !== earlier) {
                return message;
            }
            pageChanged = true;
            return earlier;
        });
        if (!pageChanged) {
            return page;
        }
        changed = true;
        return { ...page, messages };
    });
    return changed ? { ...shared, pages } : shared;
}

function isMessagePages(value: unknown): value is MessagePages {
    const pages = (value as Partial<MessagePages> | null | undefined)?.pages;
    return Array.isArray(pages) && pages.every((page) => Array.isArray(page?.messages));
}
