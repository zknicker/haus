import type { Agent } from '@haus/api';
import { replaceEqualDeep } from '@tanstack/react-query';
import * as React from 'react';
import type { ChatMessageEntity } from '../../../hooks/servers/chat-message-entities.ts';
import type { ChatMessageLayout } from '../../../hooks/servers/chat-message-layout.ts';
import {
    chatMessageDirectories,
    type ProjectedChatMessageRow,
    projectChatMessage,
    projectChatMessageLayout,
} from './chat-message-model.ts';

export interface TranscriptSkeletonInput {
    /** Ids whose entity carries a task or a Thread (`useAttachedWorkIds`). */
    attachedWork: ReadonlySet<string>;
    entries: readonly ChatMessageLayout[];
}

interface SkeletonEntry {
    attachedWork: boolean;
    layout: ChatMessageLayout;
    row: ProjectedChatMessageRow;
}

export interface TranscriptSkeleton extends TranscriptSkeletonInput {
    byId: ReadonlyMap<string, SkeletonEntry>;
    rows: ProjectedChatMessageRow[];
}

export const emptyChatMessageLayouts: readonly ChatMessageLayout[] = [];
const emptyAttachedWork: ReadonlySet<string> = new Set();

export const emptyTranscriptSkeleton: TranscriptSkeleton = {
    attachedWork: emptyAttachedWork,
    byId: new Map(),
    entries: emptyChatMessageLayouts,
    rows: [],
};

/**
 * The transcript's row skeleton from ids and layout facts. Nothing on a
 * skeleton row changes once its message commits except `attachedWork`, so a
 * row keeps its object across list refetches, tail appends, and entity
 * changes alike; only a new id (or a task or Thread appearing) makes a new
 * row. Rows compare their layout structurally: a refetch may hand back new
 * layout objects for unchanged messages. The previous array comes back when
 * nothing moved, so the downstream entry and render-row memos hold too.
 */
export function projectTranscriptSkeleton(
    input: TranscriptSkeletonInput,
    previous: TranscriptSkeleton
): TranscriptSkeleton {
    if (previous.entries === input.entries && previous.attachedWork === input.attachedWork) {
        return previous;
    }
    const byId = new Map<string, SkeletonEntry>();
    let reusedEveryRow = previous.rows.length === input.entries.length;
    const rows = input.entries.map((layout, index) => {
        const attachedWork = input.attachedWork.has(layout.id);
        const cached = previous.byId.get(layout.id);
        const reuse =
            cached !== undefined &&
            cached.attachedWork === attachedWork &&
            (cached.layout === layout || replaceEqualDeep(cached.layout, layout) === cached.layout);
        const row = reuse ? cached.row : projectChatMessageLayout(layout, attachedWork);
        byId.set(layout.id, { attachedWork, layout: reuse ? cached.layout : layout, row });
        if (reusedEveryRow && previous.rows[index] !== row) {
            reusedEveryRow = false;
        }
        return row;
    });
    return {
        attachedWork: input.attachedWork,
        byId,
        entries: input.entries,
        rows: reusedEveryRow ? previous.rows : rows,
    };
}

export function useTranscriptSkeletonRows({ attachedWork, entries }: TranscriptSkeletonInput) {
    const skeletonRef = React.useRef<TranscriptSkeleton>(emptyTranscriptSkeleton);
    return React.useMemo(() => {
        const next = projectTranscriptSkeleton({ attachedWork, entries }, skeletonRef.current);
        skeletonRef.current = next;
        return next.rows;
    }, [attachedWork, entries]);
}

/**
 * Projects a `chat.message` entity into its rendered row, once per entity
 * object: an unchanged entity (React Query structural sharing keeps it) maps
 * to the same row, so its memoized views skip. A new Agent directory (task
 * assignee handles) starts a fresh cache.
 */
export function useChatMessageEntityProjector(agents: readonly Agent[]) {
    return React.useMemo(() => {
        const directories = chatMessageDirectories(agents);
        const rows = new WeakMap<ChatMessageEntity, ProjectedChatMessageRow>();
        return (entity: ChatMessageEntity) => {
            let row = rows.get(entity);
            if (!row) {
                row = projectChatMessage(entity.message, entity.thread, directories);
                rows.set(entity, row);
            }
            return row;
        };
    }, [agents]);
}
