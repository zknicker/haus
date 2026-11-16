import {
    type EarlierThreadsScope,
    isOpenThreadExpired,
    isOpenThreadInSidebar,
    type OpenThread,
    openThreadGroups,
} from '@haus/api';
import * as React from 'react';
import { useShowOpenThreads } from '../../features/threads/show-open-threads.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** How many rows the sidebar shows; With you rows are never folded away. */
const sidebarRowLimit = 12;

interface OpenThreadList {
    closedThreadChatIds: string[];
    threads: OpenThread[];
}

/** Group order, newest first within a group, so a row moves only when its group changes. */
export function sortOpenThreads(threads: readonly OpenThread[], now: Date): OpenThread[] {
    return threads
        .filter((thread) => !isOpenThreadExpired(thread, now))
        .map((thread, order) => ({ order, thread }))
        .sort(
            (left, right) =>
                openThreadGroups.indexOf(left.thread.group) -
                    openThreadGroups.indexOf(right.thread.group) || left.order - right.order
        )
        .map(({ thread }) => thread);
}

/**
 * The sidebar's rows: Threads with work first, then conversations, each in
 * Server order (newest activity first). At most twelve, more only when a With
 * you row would otherwise fold away.
 */
export function sidebarOpenThreads(threads: readonly OpenThread[], now: Date) {
    const listed = threads.filter(
        (thread) => !isOpenThreadExpired(thread, now) && isOpenThreadInSidebar(thread)
    );
    const ordered = [
        ...listed.filter((thread) => thread.jobCount > 0),
        ...listed.filter((thread) => thread.jobCount === 0),
    ];
    const shown = ordered.filter(
        (thread, index) => index < sidebarRowLimit || thread.group === 'with-you'
    );
    return {
        hiddenCount: ordered.length - shown.length,
        threadChatIds: shown.map((thread) => thread.threadChatId),
    };
}

function useOpenThreadList<Selected>(
    serverId: string,
    select: (list: OpenThreadList) => Selected,
    enabled = true
) {
    return hausTrpc.thread.listOpen.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, enabled, select }
    );
}

/** The sidebar lists work and the viewer's own conversations; the Threads page lists every open Thread. */
function selectLayout(list: OpenThreadList) {
    return sidebarOpenThreads(list.threads, new Date());
}

/** The section's structure only; each row reads its own entry. */
export function useOpenThreadLayout(serverId: string) {
    return useOpenThreadList(serverId, selectLayout).data;
}

export function useOpenThreadEntry(serverId: string, threadChatId: string) {
    const select = React.useCallback(
        (list: OpenThreadList) =>
            list.threads.find((thread) => thread.threadChatId === threadChatId),
        [threadChatId]
    );
    return useOpenThreadList(serverId, select).data;
}

function selectSorted(list: OpenThreadList) {
    return sortOpenThreads(list.threads, new Date());
}

/** Every open Thread, for the Threads page and the command menu. */
export function useOpenThreads(serverId: string) {
    return useOpenThreadList(serverId, selectSorted).data;
}

/** Whether the viewer can Close or Reopen this Thread; null when it is on neither list. */
export function useThreadClosure(serverId: string, threadChatId: string | undefined) {
    const select = React.useCallback(
        (list: OpenThreadList): 'closed' | 'open' | null => {
            if (list.closedThreadChatIds.includes(threadChatId ?? '')) {
                return 'closed';
            }
            return list.threads.some((thread) => thread.threadChatId === threadChatId)
                ? 'open'
                : null;
        },
        [threadChatId]
    );
    const shown = useShowOpenThreads();
    const closure = useOpenThreadList(serverId, select, shown).data ?? null;
    return shown ? closure : null;
}

/** `thread.onClosedUpdated` owns the refresh. */
export function useSetThreadClosed() {
    return hausTrpc.thread.setClosed.useMutation();
}

/** Threads no longer open, a page at a time. */
export function useEarlierThreads(serverId: string, scope: EarlierThreadsScope) {
    return hausTrpc.thread.listEarlier.useInfiniteQuery(
        { scope, serverId },
        {
            ...queryPolicy.syncedSnapshot,
            getNextPageParam: (page) => page.nextCursor,
        }
    );
}
