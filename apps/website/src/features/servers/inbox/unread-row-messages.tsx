import type { ChatMessage } from '@haus/api';
import * as React from 'react';
import { buildTranscriptEntries } from '../../chats/chat-transcript-model.ts';
import { TranscriptRenderProvider } from '../../chats/chat-transcript-render-context.tsx';
import { TranscriptEntryView } from '../../chats/chat-transcript-turn.tsx';
import { useUnreadRowRenderContext } from './unread-row-render-context.tsx';

const noTasks: never[] = [];

export function UnreadRowMessages({
    chatId,
    messages,
    onOpenConversation,
    serverId,
}: {
    chatId: string;
    /** Oldest first, as `chat.unreadPreviews` returns them. */
    messages: readonly ChatMessage[];
    onOpenConversation: () => void;
    serverId: string;
}) {
    const renderContext = useUnreadRowRenderContext({
        chatId,
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
                          projectMessageEntity({ message, tasks: noTasks })
                      ),
                  })
                : [],
        [messages, projectMessageEntity]
    );

    return (
        <TranscriptRenderProvider value={renderContext}>
            {/* A transcript row carries no gutter of its own (the chat's scroller
                gives it one), so the card insets its messages to its source
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
