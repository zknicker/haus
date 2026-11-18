import type { Chat } from '@haus/api';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { TaskStateDisc } from '../../tasks/task-state-disc.tsx';
import type { FollowedTaskPreview } from './unread-rows.ts';
import { type UnreadRowTriage, UnreadTriageRow } from './unread-triage-row.tsx';

/**
 * A followed Task with unread messages as a card in the Unread feed (ADR 0052
 * decision 9), the way an unread Channel reads: its state mark, its key and
 * title, the Channel it started from, its waiting messages, and a composer that
 * posts into the Task's own Chat. The name opens the Task page.
 */
export function UnreadTaskChatRow({
    origin,
    preview,
    serverId,
    triage,
}: {
    /** The Channel the Task started from, when the Chat list holds it. */
    origin: Chat | undefined;
    preview: FollowedTaskPreview;
    serverId: string;
    triage: UnreadRowTriage;
}) {
    const { task } = preview;
    const title = `${task.key} ${task.title}`;
    const newest = preview.messages.at(-1);

    return (
        <UnreadTriageRow
            triage={triage}
            view={{
                count: preview.messages.length + preview.earlierUnreadCount,
                label: title,
                mark: (
                    <span className="flex size-6 shrink-0 items-center justify-center">
                        <TaskStateDisc state={task.state} />
                    </span>
                ),
                messages: {
                    chatId: preview.chatId,
                    fallbackLine: newest ? messagePreviewLine(newest.content) : '',
                    serverId,
                },
                note: origin?.kind === 'channel' && origin.name ? `#${origin.name}` : null,
                reply: {
                    agentDmId: null,
                    chatId: preview.chatId,
                    chatName: title,
                    kind: 'chat',
                    serverId,
                },
                time: newest?.createdAt ?? null,
                title,
            }}
        />
    );
}
