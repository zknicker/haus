import type { TaskPreview } from '@haus/api';
import { taskStateLabels, taskStateOf } from '../task-state.ts';

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
