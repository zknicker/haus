import type { Chat } from '@haus/api';

import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { TaskStateDisc } from '../../tasks/task-state-disc.tsx';
import type { FollowedTaskPreview } from './unread-rows.ts';
import { type UnreadRowTriage, UnreadTriageRow } from './unread-triage-row.tsx';

export function UnreadTaskChatRow({
    origin,
    preview,
    serverId,
    triage,
}: {
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
