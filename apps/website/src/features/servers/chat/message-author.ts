import type { ChatSearchResult } from '@haus/api';

export function messageAuthor(message: ChatSearchResult) {
    const author = message.author;

    return {
        avatarUrl: author.profile?.avatarUrl ?? null,
        name: author.profile?.displayName ?? (author.kind === 'agent' ? 'Captain' : 'Member'),
    };
}
