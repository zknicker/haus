import type { ChatMessage, ThreadSummary } from '@haus/api';
import * as React from 'react';
import { setChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
import type { TaskThread } from '../tasks/use-task-thread.ts';

/** A `?task=` link's Thread: the task's own, or the one its message sits in. */
export type ChatInitialTask = TaskThread;

export interface ChatThreadSelection {
    anchor: ChatMessage;
    initialSummary: ThreadSummary | null;
    initialThreadChatId?: string;
    /** The Task the Thread was opened on when its message sits inside the Thread. */
    taskMessage?: ChatMessage | null;
}

export function useChatThreadSelection(chatId: string, initialTask?: ChatInitialTask) {
    const [selection, setSelection] = React.useState<ChatThreadSelection | null>(() =>
        initialTask ? taskSelection(initialTask) : null
    );
    const initialTaskIdRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!initialTask) {
            initialTaskIdRef.current = null;
            return;
        }
        if (initialTaskIdRef.current === initialTask.taskMessageId) {
            return;
        }
        const previousTaskId = initialTaskIdRef.current;
        initialTaskIdRef.current = initialTask.taskMessageId;
        setSelection((current) =>
            !current || selectionTaskId(current) === previousTaskId
                ? taskSelection(initialTask)
                : current
        );
        setChatSidePane(chatId, 'thread');
    }, [chatId, initialTask]);

    return [selection, setSelection] as const;
}

function taskSelection(task: ChatInitialTask): ChatThreadSelection {
    return {
        anchor: task.anchor,
        initialSummary: task.summary,
        initialThreadChatId: task.threadChatId,
        taskMessage: task.taskMessage,
    };
}

/** The task a selection opened: its in-Thread message, else its anchor's own. */
function selectionTaskId(selection: ChatThreadSelection) {
    return selection.taskMessage?.id ?? selection.anchor.id;
}
