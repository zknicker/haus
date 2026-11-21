import type { ChatMessage, Worker } from '@haus/api';
import * as React from 'react';
import { useChatMessageEntries } from '../../../hooks/servers/use-chat-message.ts';
import { buildTranscriptEntries } from '../../chats/chat-transcript-model.ts';
import { TranscriptRenderProvider } from '../../chats/chat-transcript-render-context.tsx';
import { TranscriptEntryView } from '../../chats/chat-transcript-turn.tsx';
import type { TranscriptMessage } from '../../chats/transcript-contract.ts';
import { useStandaloneMessageRenderContext } from '../../servers/chat/standalone-message-render-context.tsx';
import { WorkerSteps } from './worker-steps.tsx';
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
    const baseContext = useStandaloneMessageRenderContext({
        chatId,
        messages,
        onOpenConversation: ignoreOpen,
        serverId,
    });
    const stepsById = new Map(
        items.flatMap((item) => (item.steps ? [[item.message.id, item.steps] as const] : []))
    );
    const renderBase = baseContext.renderMessageContent;
    const renderContext = {
        ...baseContext,
        renderMessageContent: (message: TranscriptMessage) => {
            const steps = stepsById.get(message.id);
            return (
                <>
                    {renderBase?.(message)}
                    {steps ? <WorkerSteps {...steps} /> : null}
                </>
            );
        },
    };
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
