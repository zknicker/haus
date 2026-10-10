import type { Query } from '@tanstack/react-query';

/** The input of a transcript list: a `chat.messages` infinite query (Chat, inline-reply chain, or Thread). */
export interface TranscriptListInput {
    chatId: string;
    limit: number;
    replyRootMessageId?: string;
    serverId: string;
}

/** The input of a transcript list query, or null for any other query. */
export function transcriptListInput(query: Pick<Query, 'queryKey'>): TranscriptListInput | null {
    const [path, options] = query.queryKey as [
        unknown,
        (
            | { input?: Partial<TranscriptListInput> & Record<string, unknown>; type?: unknown }
            | undefined
        ),
    ];
    const input = options?.input;
    if (
        !(Array.isArray(path) && path[0] === 'chat' && path[1] === 'messages') ||
        options?.type !== 'infinite' ||
        typeof input?.chatId !== 'string' ||
        typeof input.serverId !== 'string'
    ) {
        return null;
    }
    return {
        chatId: input.chatId,
        limit: typeof input.limit === 'number' ? input.limit : 50,
        ...(typeof input.replyRootMessageId === 'string'
            ? { replyRootMessageId: input.replyRootMessageId }
            : {}),
        serverId: input.serverId,
    };
}

export function isTranscriptListOf(
    query: Pick<Query, 'queryKey'>,
    scope: { chatId?: string; serverId: string }
) {
    const input = transcriptListInput(query);
    return (
        input !== null &&
        input.serverId === scope.serverId &&
        (scope.chatId === undefined || input.chatId === scope.chatId)
    );
}
