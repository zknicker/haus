/** The focused conversation already includes its anchor. */
export function threadInlineReplyMessages<Message extends { id: string }>(
    messages: readonly Message[] | undefined,
    anchorMessageId: string
): Message[] {
    return messages?.filter((message) => message.id !== anchorMessageId) ?? [];
}

export interface ThreadInlineReplyHistory {
    error: string | null;
    fetchOlder: () => void;
    hasOlder: boolean;
    isFetching: boolean;
    retry: () => void;
}
