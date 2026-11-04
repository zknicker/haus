import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

type Utils = ReturnType<typeof hausTrpc.useUtils>;

/** `thread.get`: the Thread's own Chat, its parent Chat, and its anchor message. */
export type TaskContextThread = Awaited<ReturnType<Utils['thread']['get']['fetch']>>;

const noThreads: readonly TaskContextThread[] = [];

/**
 * Where each Thread a Task item's context message sits in hangs: its parent
 * Chat and anchor, the two facts `taskInbox.list` does not carry for a Thread
 * reply. They are one read for the whole feed, walking the Threads one at a
 * time: a page of cards fanning out a request each is the burst that wedges a
 * Server. A Thread's parent and anchor never change, so nothing invalidates
 * this, and an earlier answer stays up while a new card's Thread resolves.
 */
export function useTaskContextThreads(serverId: string, threadChatIds: readonly string[]) {
    const utils = hausTrpc.useUtils();
    const query = useQuery({
        ...queryPolicy.localConfig,
        enabled: threadChatIds.length > 0,
        placeholderData: keepPreviousData,
        queryFn: () => readThreads(utils, serverId, threadChatIds),
        queryKey: ['taskInbox.contextThreads', serverId, threadChatIds],
    });
    return {
        settled: threadChatIds.length === 0 || query.status !== 'pending',
        threads: query.data ?? noThreads,
    };
}

async function readThreads(utils: Utils, serverId: string, threadChatIds: readonly string[]) {
    const threads: TaskContextThread[] = [];
    for (const threadChatId of threadChatIds) {
        const thread = await readThread(utils, serverId, threadChatId);
        if (thread) {
            threads.push(thread);
        }
    }
    return threads;
}

/** A message in a Chat the reader cannot open has no Thread to answer in; its card has no composer. */
async function readThread(utils: Utils, serverId: string, threadChatId: string) {
    try {
        return await utils.thread.get.fetch({ serverId, threadChatId });
    } catch {
        return null;
    }
}
