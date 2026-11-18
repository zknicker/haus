import type { TaskPreview } from '@haus/api';
import { taskStateLabels } from '../task-state.ts';

/**
 * What one origin preview's header says (ADR 0052 decision 7): how many
 * messages the Task holds and, for a follower with something waiting, how
 * many are new. Only a follower's Task is ever unread (decision 9). A Task
 * just started has no messages yet: its preview still shows, with no count.
 */
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

/** The open button's name: the Task, its state, and its counts, since the marks sit beside it. */
export function taskPreviewLabel(
    preview: Pick<TaskPreview, 'key' | 'messageCount' | 'state' | 'title' | 'unreadCount'>
) {
    const counts = taskPreviewCounts(preview);
    return [
        `Open task ${preview.key}`,
        preview.title,
        taskStateLabels[preview.state],
        counts.messages,
        counts.unread,
    ]
        .filter((part) => part !== null)
        .join(', ');
}
