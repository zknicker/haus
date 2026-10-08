import * as React from 'react';
import {
    type TabPresence,
    TabPresenceContext,
    useTabPresence,
} from '../../../hooks/desktop-tabs/tab-presence.ts';
import { KeptTopbarScope } from '../../shell/shell-topbar.tsx';

/**
 * Keeps the few most recent chat views of one chat route mounted inside
 * `<Activity mode="hidden">`, so switching back to a recent chat reveals its
 * view (DOM, composer, scroll anchor) instead of rebuilding every row. A hidden
 * view's effects are torn down: it holds no query or event subscriptions,
 * marks nothing read, and takes no focus, and its presence reads not shown. On
 * reveal its effects reconnect and read the current cache, which the
 * Server-scoped event stream kept live. Each view's band gets its own topbar
 * scope, hidden in the same commit as the view (see `KeptTopbarScope`).
 */
export function KeptChatViews({
    chatId,
    renderChat,
    serverId,
}: {
    chatId: string;
    renderChat: (chatId: string, active: boolean) => React.ReactNode;
    serverId: string;
}) {
    const kept = useKeptChatViews(chatId, serverId);
    return kept.order.map((id) => (
        <KeptTopbarScope active={id === chatId} key={id}>
            <React.Activity mode={id === chatId ? 'visible' : 'hidden'}>
                <KeptChatPresence active={id === chatId}>
                    {renderChat(id, id === chatId)}
                </KeptChatPresence>
            </React.Activity>
        </KeptTopbarScope>
    ));
}

/**
 * The chat views one chat route keeps mounted (hidden) so returning to a recent
 * chat reveals its view instead of rebuilding it. `order` is the render order
 * and never reorders a kept view: moving a mounted subtree in the DOM would
 * cost its scroll offset. `recency` is most-recent first and picks the evictee.
 */
export interface KeptChatViewsState {
    order: readonly string[];
    recency: readonly string[];
    serverId: string;
}

export const keptChatViewLimit = 5;

export function keepChatView(
    kept: KeptChatViewsState | null,
    input: { chatId: string; serverId: string },
    limit = keptChatViewLimit
): KeptChatViewsState {
    const { chatId, serverId } = input;
    if (!kept || kept.serverId !== serverId) {
        return { order: [chatId], recency: [chatId], serverId };
    }
    if (kept.recency[0] === chatId) {
        return kept;
    }
    const recency = [chatId, ...kept.recency.filter((id) => id !== chatId)].slice(0, limit);
    const order = kept.order.includes(chatId) ? kept.order : [...kept.order, chatId];
    return { order: order.filter((id) => recency.includes(id)), recency, serverId };
}

/** A hidden view is not shown: unread clearing, autofocus, and keyboard ownership key off this. */
function KeptChatPresence({ active, children }: { active: boolean; children: React.ReactNode }) {
    const presence = useTabPresence();
    const value = React.useMemo<TabPresence>(
        () => (active ? presence : { ...presence, focusedPane: false, shown: false }),
        [active, presence]
    );
    return <TabPresenceContext value={value}>{children}</TabPresenceContext>;
}

function useKeptChatViews(chatId: string, serverId: string) {
    const [kept, setKept] = React.useState<KeptChatViewsState>(() =>
        keepChatView(null, { chatId, serverId })
    );
    const next = keepChatView(kept, { chatId, serverId });
    if (next !== kept) {
        // Adjusting state while rendering: React re-renders before committing.
        setKept(next);
    }
    return next;
}
