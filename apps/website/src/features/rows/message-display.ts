import type { TranscriptMessage, TranscriptToolCall } from '../chats/transcript-contract.ts';

interface MessageDisplayInput extends Pick<
    TranscriptMessage,
    'content' | 'metadata' | 'senderType'
> {
    toolCall?: TranscriptToolCall | null;
}

function looksLikeSerializedPayload(content: string) {
    const normalizedContent = content.trim();
    return normalizedContent.startsWith('{') || normalizedContent.startsWith('[');
}

export function getMessageDisplay(message: MessageDisplayInput) {
    const content = message.content.trim();
    const hasToolCall = Boolean(message.toolCall ?? message.metadata?.toolCallId);
    const showBodyContent =
        content.length > 0 && !(hasToolCall && looksLikeSerializedPayload(content));
    const showHeader =
        showBodyContent ||
        (hasToolCall && (content.length === 0 || !looksLikeSerializedPayload(content)));

    return {
        content,
        showBodyContent,
        showHeader,
    };
}
