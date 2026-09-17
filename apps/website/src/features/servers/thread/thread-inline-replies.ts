import type { ChatMessage } from '@haus/api';

/** The focused conversation already includes its anchor. */
export function threadInlineReplyMessages(
    messages: readonly ChatMessage[] | undefined,
    anchorMessageId: string
) {
    return messages?.filter((message) => message.id !== anchorMessageId) ?? [];
}

export interface ThreadInlineReplyHistory {
    error: string | null;
    fetchOlder: () => void;
    hasOlder: boolean;
    isFetching: boolean;
    retry: () => void;
}
