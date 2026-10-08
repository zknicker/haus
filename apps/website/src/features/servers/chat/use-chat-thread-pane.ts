import type { ChatMessage, ThreadSummary } from '@haus/api';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { setChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
import { usePendingMessageReveal } from '../../../hooks/servers/use-pending-message-reveal.ts';
import { type OpenThread, useOpenThread } from '../../../hooks/threads/use-open-thread.ts';
import { useThreadAnchorMessage } from '../../../hooks/threads/use-thread-anchor-message.ts';
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
    revealMessage,
    transcriptMessages,
}: {
    chatId: string;
    serverId: string;
    initialTask: ChatInitialTask | undefined;
    revealMessage: (target: { id: string; sequence: number }) => void;
    transcriptMessages: ChatMessage[] | undefined;
}) {
    const openThreadTab = useOpenThread();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selection, setSelection] = useChatThreadSelection(
        chatId,
        openThreadTab ? undefined : initialTask
    );
    useThreadTabDeepLink(chatId, openThreadTab);
    // A kept chat view (`KeptChatViews`) keeps its selection while hidden. On
    // reveal its effects reconnect: a route with no `?thread=` or `?task=` shows
    // no Thread, as a freshly mounted view would.
    const syncSelectionToRoute = React.useEffectEvent(() => {
        if (openThreadTab || searchParams.has('thread') || searchParams.has('task')) {
            return;
        }
        setSelection(null);
    });
    React.useEffect(() => {
        syncSelectionToRoute();
    }, []);
    usePendingMessageReveal({
        chatId,
        ready: transcriptMessages !== undefined,
        reveal: revealMessage,
    });
    // The selection carries identity; the record itself is read live from the
    // transcript, so a Thread left open follows its anchor's own changes — a
    // Task claimed, a Cloud Agent work that finished. The captured message is
    // the fallback for an anchor this transcript has not loaded.
    const anchor = React.useMemo(
        () =>
            selection
                ? (transcriptMessages?.find((message) => message.id === selection.anchor.id) ??
                  selection.anchor)
                : null,
        [selection, transcriptMessages]
    );
    const threadAnchorId = openThreadTab ? null : searchParams.get('thread');
    const loadedAnchor = transcriptMessages?.find((message) => message.id === threadAnchorId);
    const linkedAnchor = useThreadAnchorMessage(
        serverId,
        chatId,
        transcriptMessages && !loadedAnchor ? threadAnchorId : null
    );
    const restoredAnchor = loadedAnchor ?? linkedAnchor.anchor;
    const linkedSummary =
        linkedAnchor.data?.threads.find((summary) => summary.anchorMessageId === threadAnchorId) ??
        null;
    const closeRequestedRef = React.useRef(false);
    const restoredAnchorRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!threadAnchorId) {
            restoredAnchorRef.current = null;
            return;
        }
        if (!transcriptMessages || restoredAnchorRef.current === threadAnchorId) {
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
        setSelection,
        threadAnchorId,
        transcriptMessages,
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
    return { anchor, close, onExitComplete, open, selection, viewInChannel };
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
        // Thread opens (in the right pane, ADR 0039).
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete('thread');
                next.delete('task');
                return next;
            },
            { replace: true }
        );
        openThreadTab(chatId, anchorMessageId);
    }, [anchorMessageId, chatId, openThreadTab, setSearchParams]);
}
