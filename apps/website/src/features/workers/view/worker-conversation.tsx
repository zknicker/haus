import type { ChatMessage, Worker } from '@haus/api';
import * as React from 'react';
import { useChatMessageEntries } from '../../../hooks/servers/use-chat-message.ts';
import { buildTranscriptEntries } from '../../chats/chat-transcript-model.ts';
import { TranscriptRenderProvider } from '../../chats/chat-transcript-render-context.tsx';
import { TranscriptEntryView } from '../../chats/chat-transcript-turn.tsx';
import { useUnreadRowRenderContext } from '../../servers/inbox/unread-row-render-context.tsx';
import { workerTranscriptMessages } from './worker-transcript.ts';

const noTasks: never[] = [];
const ignoreOpen = () => undefined;

export function WorkerConversation({
    chatId,
    liveLine,
    serverId,
    work,
}: {
    chatId: string;
    liveLine: null | string;
    serverId: string;
    work: Worker;
}) {
    const reportIds = work.turns.flatMap((turn) =>
        turn.outcome?.kind === 'report' && turn.outcome.report.messageId
            ? [turn.outcome.report.messageId]
            : []
    );
    const posted = useChatMessageEntries(
        reportIds.map((messageId) => ({ chatId, messageId, serverId }))
    );
    const reportMessages = new Map<string, ChatMessage>(
        posted.flatMap((entry) => (entry ? [[entry.message.id, entry.message]] : []))
    );
    const items = workerTranscriptMessages({ chatId, liveLine, reportMessages, serverId, work });
    const messages = items.map((item) => item.message);
    const renderContext = useUnreadRowRenderContext({
        chatId,
        messages,
        onOpenConversation: ignoreOpen,
        serverId,
    });
    const { projectMessageEntity } = renderContext;
    const entries = React.useMemo(
        () =>
            projectMessageEntity
                ? buildTranscriptEntries({
                      rows: items.map((item) => {
                          const row = projectMessageEntity({
                              message: item.message,
                              tasks: noTasks,
                          });
                          return item.notice
                              ? {
                                    ...row,
                                    message: { ...row.message, senderType: 'system' as const },
                                }
                              : row;
                      }),
                  })
                : [],
        [items, projectMessageEntity]
    );

    return (
        <TranscriptRenderProvider value={renderContext}>
            <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col px-5 py-4">
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
