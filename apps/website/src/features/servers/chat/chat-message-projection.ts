import type { Agent, ChatMessage, ThreadSummary } from '@haus/api';
import * as React from 'react';
import {
    chatMessageDirectories,
    type ProjectedChatMessageRow,
    projectChatMessage,
} from './chat-message-model.ts';

export interface ChatMessageProjectionInput {
    agents: readonly Agent[];
    messages: readonly ChatMessage[];
    threads: readonly ThreadSummary[];
}

export interface ChatMessageProjection extends ChatMessageProjectionInput {
    rowByMessage: ReadonlyMap<ChatMessage, ProjectedChatMessageRow>;
    rows: ProjectedChatMessageRow[];
}

export const emptyChatMessages: readonly ChatMessage[] = [];
export const emptyChatThreads: readonly ThreadSummary[] = [];
export const emptyChatAgents: readonly Agent[] = [];

export const emptyChatMessageProjection: ChatMessageProjection = {
    agents: emptyChatAgents,
    messages: emptyChatMessages,
    rowByMessage: new Map(),
    rows: [],
    threads: emptyChatThreads,
};

/**
 * Rebuilds only the rows a refetch actually changed.
 *
 * React Query's structural sharing hands back the *same* message object for
 * every message the server returned unchanged, so source identity is the
 * change signal — Server messages carry no version or `updatedAt` field. A row
 * is reprojected only when its message object, its thread summary, or (for a
 * task message) the Agent directory behind its assignee changed.
 * Everything else keeps its previous row object, which is what lets the
 * transcript's row memo skip re-rendering and re-parsing untouched markdown.
 */
export function projectStableChatMessages(
    input: ChatMessageProjectionInput,
    previous: ChatMessageProjection
): ChatMessageProjection {
    if (
        previous.messages === input.messages &&
        previous.threads === input.threads &&
        previous.agents === input.agents
    ) {
        return previous;
    }

    const threadsByAnchor = new Map(
        input.threads.map((thread) => [thread.anchorMessageId, thread])
    );
    const directories = chatMessageDirectories(input.agents);
    const directoriesChanged = previous.agents !== input.agents;
    const rowByMessage = new Map<ChatMessage, ProjectedChatMessageRow>();
    let reusedEveryRow = previous.rows.length === input.messages.length;

    const rows = input.messages.map((message, index) => {
        const thread = threadsByAnchor.get(message.id) ?? null;
        const cached = previous.rowByMessage.get(message);
        const row =
            cached && cached.thread === thread && !(directoriesChanged && message.task)
                ? cached
                : projectChatMessage(message, thread, directories);

        rowByMessage.set(message, row);

        if (reusedEveryRow && previous.rows[index] !== row) {
            reusedEveryRow = false;
        }

        return row;
    });

    return {
        agents: input.agents,
        messages: input.messages,
        // Keeping the array itself when nothing moved lets the downstream
        // entry and render-row memos hold too.
        rowByMessage,
        rows: reusedEveryRow ? previous.rows : rows,
        threads: input.threads,
    };
}

export function useStableChatMessageRows({
    agents,
    messages,
    threads,
}: ChatMessageProjectionInput) {
    const projectionRef = React.useRef<ChatMessageProjection>(emptyChatMessageProjection);

    return React.useMemo(() => {
        const next = projectStableChatMessages(
            { agents, messages, threads },
            projectionRef.current
        );

        projectionRef.current = next;

        return next.rows;
    }, [agents, messages, threads]);
}
