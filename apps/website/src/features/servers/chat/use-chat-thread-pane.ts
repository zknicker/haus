import type { ChatMessage, ThreadSummary } from '@haus/api';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useViewShownChange } from '../../../hooks/desktop-tabs/view-shown.ts';
import { setChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
import { useChatMessage } from '../../../hooks/servers/use-chat-message.ts';
import { usePendingMessageReveal } from '../../../hooks/servers/use-pending-message-reveal.ts';
import { type OpenThread, useOpenThread } from '../../../hooks/threads/use-open-thread.ts';
import { type ChatInitialTask, useChatThreadSelection } from './use-chat-thread-selection.ts';

/**
 * Where a Chat's Threads open. Desktop routes every opener, `?thread=` and
 * `?task=` deep links included, to the Thread's page (`useOpenThread`, a link
 * from this tab, ADR 0039) and strips the param, so the chat side pane never
 * hosts a Thread there. The website keeps the Thread in the chat side pane,
 * its anchor carried in `?thread=`. A Thread page's "View in chat" reveals its
 * anchor here once the transcript loads.
 */
export function useChatThreadPane({
    chatId,
    serverId,
    initialTask,
    ready,
    revealMessage,
}: {
    chatId: string;
    serverId: string;
    initialTask: ChatInitialTask | undefined;
    /** The chat's transcript list has loaded. */
    ready: boolean;
    revealMessage: (target: { id: string; sequence: number }) => void;
}) {
    const openThreadTab = useOpenThread();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selection, setSelection] = useChatThreadSelection(
        chatId,
        openThreadTab ? undefined : initialTask
    );
    useThreadTabDeepLink(chatId, openThreadTab);
    // A kept chat view (`KeptChatViews`) keeps its selection while hidden. On
    // reveal, a route with no `?thread=` or `?task=` shows no Thread, as a
    // freshly mounted view would.
    const syncSelectionToRoute = React.useEffectEvent(() => {
        if (openThreadTab || searchParams.has('thread') || searchParams.has('task')) {
            return;
        }
        setSelection(null);
    });
    React.useEffect(() => {
        syncSelectionToRoute();
    }, []);
    useViewShownChange((shown) => {
        if (shown) {
            syncSelectionToRoute();
        }
    });
    usePendingMessageReveal({ chatId, ready, reveal: revealMessage });
    // The selection carries identity; the record itself is read live from its
    // entity, so a Thread left open follows its anchor's own changes — a Task
    // claimed, a Cloud Agent work that finished, a new reply in its summary.
    // The captured message is the fallback until the entity loads.
    const selected = useChatMessage(serverId, chatId, selection?.anchor.id ?? '', {
        enabled: selection !== null,
    });
    const anchor = selection ? (selected?.message ?? selection.anchor) : null;
    const threadAnchorId = openThreadTab ? null : searchParams.get('thread');
    const linked = useChatMessage(serverId, chatId, threadAnchorId ?? '', {
        enabled: ready && threadAnchorId !== null,
    });
    const restoredAnchor = linked?.message;
    const linkedSummary = linked?.thread ?? null;
    const closeRequestedRef = React.useRef(false);
    const restoredAnchorRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!threadAnchorId) {
            restoredAnchorRef.current = null;
            return;
        }
        if (!ready || restoredAnchorRef.current === threadAnchorId) {
            return;
        }
        const restored = restoredAnchor;
        if (!restored) {
            return;
        }
        restoredAnchorRef.current = threadAnchorId;
        if (selection?.anchor.id === restored.id) {
            return;
        }
        setSelection({ anchor: restored, initialSummary: linkedSummary });
        setChatSidePane(chatId, 'thread');
    }, [
        chatId,
        linkedSummary,
        restoredAnchor,
        selection?.anchor.id,
        ready,
        setSelection,
        threadAnchorId,
    ]);
    const close = React.useCallback(() => {
        closeRequestedRef.current = true;
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete('thread');
                return next;
            },
            { replace: true }
        );
        setChatSidePane(chatId, 'artifact');
    }, [chatId, setSearchParams]);
    // The transcript's render context reaches rows through React context; fresh
    // callbacks would rebuild it and re-render the whole transcript.
    const open = React.useCallback(
        (next: ChatMessage, initialSummary: ThreadSummary | null) => {
            if (openThreadTab) {
                openThreadTab(chatId, next.id);
                return;
            }
            closeRequestedRef.current = false;
            setSelection({ anchor: next, initialSummary });
            setSearchParams(
                (current) => {
                    const params = new URLSearchParams(current);
                    params.set('thread', next.id);
                    return params;
                },
                { replace: true }
            );
            setChatSidePane(chatId, 'thread');
        },
        [chatId, openThreadTab, setSearchParams, setSelection]
    );
    const viewInChannel = () => {
        const current = selection?.anchor;
        close();
        if (current) {
            revealMessage({ id: current.id, sequence: current.sequence });
        }
    };
    const onExitComplete = () => {
        if (closeRequestedRef.current) {
            closeRequestedRef.current = false;
            setSelection(null);
        }
    };
    return {
        anchor,
        close,
        onExitComplete,
        open,
        selection,
        /** The open Thread's live summary, once its anchor entity has loaded. */
        summary: selected?.thread,
        viewInChannel,
    };
}

/** Desktop: a `?thread=` or `?task=` link opens that Thread's page, then leaves the URL. */
function useThreadTabDeepLink(chatId: string, openThreadTab: OpenThread | null) {
    const [searchParams, setSearchParams] = useSearchParams();
    const anchorMessageId = searchParams.get('thread') ?? searchParams.get('task');
    React.useEffect(() => {
        if (!(openThreadTab && anchorMessageId)) {
            return;
        }
        // Strip first, so the replace lands on this chat's entry before the
        // Thread opens. A deep link is a plain Open (the right pane, ADR 0039),
        // whatever click happens to be in flight while this effect runs.
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete('thread');
                next.delete('task');
                return next;
            },
            { replace: true }
        );
        openThreadTab(chatId, anchorMessageId, 'auto');
    }, [anchorMessageId, chatId, openThreadTab, setSearchParams]);
}
