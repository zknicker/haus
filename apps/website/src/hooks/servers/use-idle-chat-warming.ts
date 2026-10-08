import type { Chat } from '@haus/api';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { hasCachedChatReads, preloadChatReads } from './use-preload-chat.ts';

const recentChatCount = 8;
// The dev Server's connection pool wedges under App fan-out, so warming trickles.
const warmConcurrency = 2;

/**
 * Once the shell is idle, warm the first paint of the Chats a person is likely
 * to open next — every unread Chat, then the most recently active ones — so
 * keyboard, command menu, and notification opens land warm like a hovered row.
 * Each Chat warms at most once per Server visit and only when nothing is cached;
 * after that, events and the mounted reads own its freshness.
 */
export function useIdleChatWarming(
    serverId: string | undefined,
    chats: readonly Chat[] | undefined
) {
    const utils = hausTrpc.useUtils();
    const queryClient = useQueryClient();
    const warmer = React.useRef<ChatWarmer | null>(null);

    React.useEffect(() => {
        if (!serverId) {
            return;
        }
        const next = createChatWarmer({
            concurrency: warmConcurrency,
            schedule: scheduleIdle,
            warm: (chatId) =>
                hasCachedChatReads(queryClient, utils, serverId, chatId)
                    ? Promise.resolve()
                    : preloadChatReads({ chatId, queryClient, serverId, utils }),
        });
        warmer.current = next;
        return () => {
            next.dispose();
            warmer.current = null;
        };
    }, [queryClient, serverId, utils]);

    // Declared after the warmer's effect, so a Server switch enqueues into the new one.
    React.useEffect(() => {
        if (chats) {
            warmer.current?.enqueue(chatsToWarm(chats, recentChatCount));
        }
    }, [chats]);
}

/** Unread Chats first, then the most recently active, without repeats. */
export function chatsToWarm(chats: readonly Chat[], recentCount: number): string[] {
    const byActivity = chats
        .filter((chat) => chat.kind === 'channel' || chat.kind === 'dm')
        .sort((left, right) => activityTime(right) - activityTime(left));
    const unread = byActivity.filter((chat) => chat.unreadCount > 0);
    return [...new Set([...unread, ...byActivity.slice(0, recentCount)].map((chat) => chat.id))];
}

export interface ChatWarmer {
    dispose: () => void;
    enqueue: (chatIds: readonly string[]) => void;
}

/** A bounded idle queue: each Chat is attempted once, at most `concurrency` at a time. */
export function createChatWarmer({
    concurrency,
    schedule,
    warm,
}: {
    concurrency: number;
    schedule: (run: () => void) => () => void;
    warm: (chatId: string) => Promise<unknown>;
}): ChatWarmer {
    const attempted = new Set<string>();
    const queue: string[] = [];
    const cancels = new Set<() => void>();
    let active = 0;
    let disposed = false;

    const pump = () => {
        while (!disposed && active < concurrency && queue.length > 0) {
            const chatId = queue.shift() as string;
            active += 1;
            const cancel = schedule(() => {
                cancels.delete(cancel);
                if (disposed) {
                    return;
                }
                // Preloads never reject (React Query's prefetch settles quietly).
                void warm(chatId).finally(() => {
                    active -= 1;
                    pump();
                });
            });
            cancels.add(cancel);
        }
    };

    return {
        dispose() {
            disposed = true;
            queue.length = 0;
            for (const cancel of cancels) {
                cancel();
            }
            cancels.clear();
        },
        enqueue(chatIds) {
            for (const chatId of chatIds) {
                if (!attempted.has(chatId)) {
                    attempted.add(chatId);
                    queue.push(chatId);
                }
            }
            pump();
        },
    };
}

function scheduleIdle(run: () => void): () => void {
    if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(run, { timeout: 3000 });
        return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 250);
    return () => window.clearTimeout(id);
}

function activityTime(chat: Chat): number {
    return chat.lastActivityAt ? Date.parse(chat.lastActivityAt) : 0;
}
