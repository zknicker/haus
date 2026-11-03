import type { ChatMessage, TaskListItem, ThreadSummary } from '@haus/api';
import * as React from 'react';
import { useChatMessage } from '../../../hooks/servers/use-chat-message.ts';
import { taskThreadTarget } from './task-thread-target.ts';

/** A task opened as its Thread, under the task's Channel or DM. */
export interface TaskThread {
    /** The Thread's anchor, a top-level message of the task's Channel or DM. */
    anchor: ChatMessage;
    summary: ThreadSummary;
    /** The task's message when it sits inside the Thread; null when it anchors it. */
    taskMessage: ChatMessage | null;
    /** Names the opening: two tasks in one Thread are two openings. */
    taskMessageId: string;
    threadChatId: string;
}

/**
 * The Thread a listed task opens: its own for a top-level task, the one it
 * sits in for a Thread task, whose anchor reads (or fetches) its entity.
 * Undefined until that anchor loads, or when the task names no openable Thread.
 */
export function useTaskThread(
    serverId: string,
    item: TaskListItem | undefined
): TaskThread | undefined {
    const target = item ? taskThreadTarget(item) : null;
    const inThread = target?.kind === 'in-thread';
    const anchorEntity = useChatMessage(
        serverId,
        item?.task.chatId ?? '',
        inThread ? target.anchorMessageId : '',
        { enabled: inThread }
    );
    const anchorMessage = anchorEntity?.message;
    const anchorSummary = anchorEntity?.thread ?? null;

    return React.useMemo(() => {
        const opened = item ? taskThreadTarget(item) : null;
        if (!(item && opened)) {
            return;
        }
        // The task-list message may omit the task projection; the Thread's
        // header and metadata key off it, so attach it explicitly.
        const message = { ...item.message, task: item.task };
        if (opened.kind === 'anchor') {
            return {
                anchor: message,
                summary: item.threadSummary,
                taskMessage: null,
                taskMessageId: message.id,
                threadChatId: opened.threadChatId,
            };
        }
        if (!anchorMessage) {
            return;
        }
        return {
            anchor: anchorMessage,
            summary: anchorSummary ?? item.threadSummary,
            taskMessage: message,
            taskMessageId: message.id,
            threadChatId: opened.threadChatId,
        };
    }, [anchorMessage, anchorSummary, item]);
}
