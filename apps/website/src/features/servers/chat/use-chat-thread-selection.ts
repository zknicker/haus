import type { ChatMessage, ThreadSummary } from '@haus/api';
import * as React from 'react';
import { setChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';

export interface ChatInitialTask {
    message: ChatMessage;
    summary: ThreadSummary;
    threadChatId: string;
}

export interface ChatThreadSelection {
    anchor: ChatMessage;
    initialSummary: ThreadSummary | null;
    initialThreadChatId?: string;
}

export function useChatThreadSelection(chatId: string, initialTask?: ChatInitialTask) {
    const [selection, setSelection] = React.useState<ChatThreadSelection | null>(() =>
        initialTask
            ? {
                  anchor: initialTask.message,
                  initialSummary: initialTask.summary,
                  initialThreadChatId: initialTask.threadChatId,
              }
            : null
    );
    const initialTaskIdRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!initialTask) {
            initialTaskIdRef.current = null;
            return;
        }
        if (initialTaskIdRef.current === initialTask.message.id) {
            return;
        }
        const previousTaskId = initialTaskIdRef.current;
        initialTaskIdRef.current = initialTask.message.id;
        setSelection((current) =>
            !current || current.anchor.id === previousTaskId
                ? {
                      anchor: initialTask.message,
                      initialSummary: initialTask.summary,
                      initialThreadChatId: initialTask.threadChatId,
                  }
                : current
        );
        setChatSidePane(chatId, 'thread');
    }, [chatId, initialTask]);

    return [selection, setSelection] as const;
}
