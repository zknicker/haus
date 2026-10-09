import * as React from 'react';
import { UNSAFE_LocationContext, UNSAFE_RouteContext } from 'react-router-dom';
import {
    type TabPresence,
    TabPresenceContext,
    useTabPresence,
} from '../../../hooks/desktop-tabs/tab-presence.ts';
import { createViewShownSource, ViewShownContext } from '../../../hooks/desktop-tabs/view-shown.ts';
import { cn } from '../../../lib/utils.ts';
import { KeptTopbarScope } from '../../shell/shell-topbar.tsx';

/**
 * Keeps the few most recent chat views of one chat route mounted and
 * effect-alive, stacked in one grid cell, so switching back to a recent chat
 * reveals its view (DOM, composer, scroll offset) in the next frame instead of
 * rebuilding or re-running every effect. A hidden view is skipped by the
 * renderer (`content-visibility: hidden`), invisible, `inert` and
 * `aria-hidden`, so it takes no focus, input, or screen reader. It sees the
 * route it last had while shown, and its presence reads not shown: unread
 * clearing, the window title, typing streams, and keyboard and composer
 * commands gate on that, and reveal-time work (composer focus, Thread pane
 * sync) runs from `useViewShownChange`. Each view's band gets its own topbar
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
    return (
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1">
            {kept.order.map((id) => (
                <KeptChatView active={id === chatId} key={id}>
                    {renderChat(id, id === chatId)}
                </KeptChatView>
            ))}
        </div>
    );
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

/**
 * One kept view in the shared grid cell: every view keeps the shown view's
 * size, so a reveal does no resize work. `content-visibility: hidden` (not
 * `visibility` alone, which still styles and lays out the subtree) skips its
 * style, layout, and paint while it keeps its scroll offset.
 */
function KeptChatView({ active, children }: { active: boolean; children: React.ReactNode }) {
    return (
        <KeptTopbarScope active={active}>
            <div
                aria-hidden={active ? undefined : true}
                className={cn(
                    // Column, so the chat fills the cell's width by stretch; in a row its
                    // `min-width: auto` let a wide table push the composer past the pane.
                    'col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col',
                    !active && 'invisible [content-visibility:hidden]'
                )}
                data-kept-chat-view={active ? 'shown' : 'hidden'}
                inert={!active}
            >
                <HeldRoute active={active}>
                    <KeptChatPresence active={active}>{children}</KeptChatPresence>
                </HeldRoute>
            </div>
        </KeptTopbarScope>
    );
}

/** A hidden view is not shown: unread clearing, autofocus, and keyboard ownership key off this. */
function KeptChatPresence({ active, children }: { active: boolean; children: React.ReactNode }) {
    const presence = useTabPresence();
    const shown = active && presence.shown;
    const value = React.useMemo<TabPresence>(
        () => (active ? presence : { ...presence, focusedPane: false, shown: false }),
        [active, presence]
    );
    const [viewShown] = React.useState(() => createViewShownSource(shown));
    React.useLayoutEffect(() => {
        viewShown.set(shown);
    }, [shown, viewShown]);
    // Passive, after the subtree's own effects, so reveal work lands after the reveal paints.
    React.useEffect(() => {
        viewShown.notify(shown);
    }, [shown, viewShown]);
    return (
        <TabPresenceContext value={value}>
            <ViewShownContext value={viewShown}>{children}</ViewShownContext>
        </TabPresenceContext>
    );
}

/**
 * A hidden view keeps the location and route match it last saw while shown.
 * The route's search params belong to the shown chat (`?thread=`, `?task=`),
 * and a navigation changes both context values, which would otherwise
 * re-render every router reader in every hidden view on each switch.
 */
function HeldRoute({ active, children }: { active: boolean; children: React.ReactNode }) {
    const location = React.use(UNSAFE_LocationContext);
    const route = React.use(UNSAFE_RouteContext);
    const [held, setHeld] = React.useState({ location, route });
    if (active && (held.location !== location || held.route !== route)) {
        // Adjusting state while rendering: React re-renders before committing.
        setHeld({ location, route });
    }
    const value = active ? { location, route } : held;
    return (
        <UNSAFE_LocationContext value={value.location}>
            <UNSAFE_RouteContext value={value.route}>{children}</UNSAFE_RouteContext>
        </UNSAFE_LocationContext>
    );
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
