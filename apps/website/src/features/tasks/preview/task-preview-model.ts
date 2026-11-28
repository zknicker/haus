import type { TaskPreview, TaskReplyPreview } from '@haus/api';
import { taskStateLabels, taskStateOf } from '../task-state.ts';

export function taskPreviewAuthorName(
    message: Pick<TaskReplyPreview, 'authorAgentId'>,
    taskAgentNames: ReadonlyMap<string, string> | undefined,
    profileName: string | undefined
) {
    const taskAgentName = message.authorAgentId
        ? taskAgentNames?.get(message.authorAgentId)
        : undefined;
    return { name: taskAgentName ?? profileName ?? 'Unknown', taskAgent: Boolean(taskAgentName) };
}

export function taskPreviewCounts(preview: Pick<TaskPreview, 'messageCount' | 'unreadCount'>) {
    const { messageCount } = preview;
    return {
        messages:
            messageCount === 0
                ? null
                : `${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`,
        unread: preview.unreadCount > 0 ? `${preview.unreadCount} new` : null,
    };
}

export function taskPreviewLabel(
    preview: Pick<TaskPreview, 'archivedAt' | 'messageCount' | 'title' | 'unreadCount'>
) {
    const counts = taskPreviewCounts(preview);
    return [
        `Open task ${preview.title}`,
        taskStateLabels[taskStateOf(preview)],
        counts.messages,
        counts.unread,
    ]
        .filter((part) => part !== null)
        .join(', ');
}
