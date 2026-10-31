import type { ChatMessage } from '@haus/api';
import * as React from 'react';
import { buildTranscriptEntries } from '../../chats/chat-transcript-model.ts';
import { TranscriptRenderProvider } from '../../chats/chat-transcript-render-context.tsx';
import { TranscriptEntryView } from '../../chats/chat-transcript-turn.tsx';
import { useUnreadRowRenderContext } from './unread-row-render-context.tsx';

/**
 * An open row's waiting messages, rendered by the transcript's own entry view
 * so mentions, references, lists, attachments, and authors look exactly as
 * they do in the conversation (ADR 0050).
 *
 * The entries project straight from the preview's messages rather than from
 * `chat.message` entities: the preview carries no Thread summary, so seeding
 * entities from it would erase a parent's Thread preview in the transcript,
 * and reading entities per row is the per-Chat fan-out the one preview read
 * exists to avoid. The previews' own invalidation keeps these fresh.
 */
export function UnreadRowMessages({
    chatId,
    conversationChatId,
    messages,
    onOpenConversation,
    serverId,
}: {
    chatId: string;
    conversationChatId: string;
    /** Oldest first, as `chat.unreadPreviews` returns them. */
    messages: readonly ChatMessage[];
    onOpenConversation: () => void;
    serverId: string;
}) {
    const renderContext = useUnreadRowRenderContext({
        chatId,
        conversationChatId,
        messages,
        onOpenConversation,
        serverId,
    });
    const { projectMessageEntity } = renderContext;
    const entries = React.useMemo(
        () =>
            projectMessageEntity
                ? buildTranscriptEntries({
                      rows: messages.map((message) =>
                          projectMessageEntity({ message, thread: null })
                      ),
                  })
                : [],
        [messages, projectMessageEntity]
    );

    return (
        <TranscriptRenderProvider value={renderContext}>
            {/* A transcript row carries no gutter of its own (the chat's scroller
                gives it one), so the open row insets its messages to its source
                line `ItemCard`'s padding and every avatar sits under the place's
                mark. The gap is the row's own, between turns: it lifts a few
                messages out of their conversation, so each speaker's turn gets a
                step more air than the transcript's packed rows, without restyling
                those rows. A turn's own follow-up lines stay packed inside it. */}
            <div className="flex min-w-0 flex-col gap-2 px-4 pb-3">
                {entries.map((entry) => (
                    <TranscriptEntryView
                        activeReply={null}
                        chatId={chatId}
                        conversationLayout={renderContext.conversationLayout}
                        entry={entry}
                        key={entry.id}
                    />
                ))}
            </div>
        </TranscriptRenderProvider>
    );
}
