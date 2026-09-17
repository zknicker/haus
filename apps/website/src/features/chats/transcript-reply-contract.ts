import type { ChatMessageReplyReference } from '@haus/api';

/** The bounded parent/root excerpt carried by a Channel or DM reply. */
export type TranscriptReplyReference = ChatMessageReplyReference;

export type InlineReplyNavigation = (
    reference: TranscriptReplyReference,
    scrollToMessage?: (id: string) => boolean
) => void;
