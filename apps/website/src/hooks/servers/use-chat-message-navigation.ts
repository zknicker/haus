import { toast } from '@heroui/react';
import * as React from 'react';

export interface ChatMessageJumpTarget {
    id: string;
    sequence: number;
}

/** The transcript scroller's own jump, keyed by a scroller item's `messageId`. */
export type ScrollToMessage = (id: string) => boolean;

/**
 * The transcript's render window: only rows near the viewport render, so a
 * loaded message may have no element yet. `renderMessage` renders the rows
 * around it and returns true when the caller must wait a frame to find it.
 */
type RenderWindow = React.RefObject<{ renderMessage(id: string): boolean } | null>;

interface NavigationSnapshot {
    chatId: string;
    fetchOlderHistory: () => Promise<unknown>;
    hasOlderHistory: boolean;
    messages: readonly ChatMessageJumpTarget[] | undefined;
    renderWindow: RenderWindow | undefined;
    transcript: Transcript;
}

/**
 * The Chat's own transcript. A window holds many copies of a message (a Thread
 * page shows its root, hidden tabs keep their transcripts), so a reveal looks
 * only inside this one.
 */
type Transcript = React.RefObject<ParentNode | null>;

/**
 * Reveals a message in a cursor-paginated transcript, loading older pages only
 * while the target sequence is outside the loaded range. A generation token
 * makes a pending jump harmless when the user starts another jump or changes
 * Chats before the request finishes.
 *
 * `scroller` is the transcript scroller's own jump. A reveal goes through it so
 * the scroller leaves its follow-the-end mode: a bare `scrollIntoView` leaves it
 * following the end, and the next resize (the older page that just loaded)
 * pins the transcript back to the bottom.
 */
export function useChatMessageNavigation({
    chatId,
    fetchOlderHistory,
    hasOlderHistory,
    messages,
    renderWindow,
    scroller,
    transcript,
}: {
    chatId: string;
    fetchOlderHistory: () => Promise<unknown>;
    hasOlderHistory: boolean;
    messages: readonly ChatMessageJumpTarget[] | undefined;
    renderWindow?: RenderWindow;
    scroller?: React.RefObject<ScrollToMessage | null>;
    transcript: Transcript;
}) {
    const requestGeneration = React.useRef(0);
    const lastChatId = React.useRef(chatId);
    if (lastChatId.current !== chatId) {
        lastChatId.current = chatId;
        requestGeneration.current += 1;
    }
    React.useEffect(() => {
        return () => {
            requestGeneration.current += 1;
        };
    }, []);
    const snapshot = React.useRef<NavigationSnapshot>({
        chatId,
        fetchOlderHistory,
        hasOlderHistory,
        messages,
        renderWindow,
        transcript,
    });
    snapshot.current = {
        chatId,
        fetchOlderHistory,
        hasOlderHistory,
        messages,
        renderWindow,
        transcript,
    };

    const revealMessage = React.useCallback(
        (target: ChatMessageJumpTarget, scrollToMessage?: ScrollToMessage) => {
            const generation = requestGeneration.current + 1;
            requestGeneration.current = generation;

            void revealMessageInHistory({
                generation,
                requestGeneration,
                snapshot,
                target,
                scrollToMessage: scrollToMessage ?? ((id) => scroller?.current?.(id) ?? false),
            });
        },
        [scroller]
    );

    return { revealMessage };
}

export function revealLoadedMessage(
    transcript: Transcript,
    target: ChatMessageJumpTarget,
    scrollToMessage?: (id: string) => boolean
) {
    const escapedId = CSS.escape(target.id);
    const element = transcript.current?.querySelector<HTMLElement>(
        `[data-message-id="${escapedId}"]`
    );

    if (!element) {
        return false;
    }

    element.classList.add('chat-thread-flash');
    const item = element.closest<HTMLElement>('[data-slot="message-scroller-item"]');
    if (item?.dataset.messageId && scrollToMessage) {
        scrollToMessage(item.dataset.messageId);
    }
    element.scrollIntoView({ behavior: 'instant', block: 'center' });
    window.setTimeout(() => element.classList.remove('chat-thread-flash'), 1500);
    return true;
}

function getOldestSequence(messages: readonly ChatMessageJumpTarget[] | undefined) {
    if (!messages || messages.length === 0) {
        return undefined;
    }

    return messages.reduce(
        (oldest, message) => Math.min(oldest, message.sequence),
        Number.POSITIVE_INFINITY
    );
}

function nextPaint() {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

async function revealMessageInHistory({
    generation,
    requestGeneration,
    snapshot,
    target,
    scrollToMessage,
}: {
    generation: number;
    requestGeneration: { current: number };
    snapshot: { current: NavigationSnapshot };
    target: ChatMessageJumpTarget;
    scrollToMessage?: (id: string) => boolean;
}) {
    if (
        await revealRenderedMessage(
            snapshot,
            target,
            generation,
            requestGeneration,
            scrollToMessage
        )
    ) {
        return;
    }

    while (requestGeneration.current === generation) {
        const current = snapshot.current;
        if (targetIsLoadedRangeMiss(target, current.messages) || !current.hasOlderHistory) {
            showNavigationFailure(target);
            return;
        }

        if (!(await fetchOlderPage(current, generation, requestGeneration))) {
            return;
        }

        await nextPaint();
        if (
            requestGeneration.current !== generation ||
            (await revealRenderedMessage(
                snapshot,
                target,
                generation,
                requestGeneration,
                scrollToMessage
            ))
        ) {
            return;
        }
    }
}

/** Renders the target's rows when the window has not, then reveals it; true when handled. */
async function revealRenderedMessage(
    snapshot: { current: NavigationSnapshot },
    target: ChatMessageJumpTarget,
    generation: number,
    requestGeneration: { current: number },
    scrollToMessage?: (id: string) => boolean
) {
    if (snapshot.current.renderWindow?.current?.renderMessage(target.id)) {
        await nextPaint();
        if (requestGeneration.current !== generation) {
            return true;
        }
    }
    return revealLoadedMessage(snapshot.current.transcript, target, scrollToMessage);
}

async function fetchOlderPage(
    snapshot: NavigationSnapshot,
    generation: number,
    requestGeneration: { current: number }
) {
    try {
        const result = await snapshot.fetchOlderHistory();
        if (historyFetchFailed(result)) {
            if (requestGeneration.current === generation) {
                toast.danger('Could not load that message');
            }
            return false;
        }
    } catch {
        if (requestGeneration.current === generation) {
            toast.danger('Could not load that message');
        }
        return false;
    }

    return requestGeneration.current === generation;
}

/** React Query resolves page errors into an error result unless told to throw. */
export function historyFetchFailed(result: unknown): result is { isError: true } {
    return (
        typeof result === 'object' &&
        result !== null &&
        'isError' in result &&
        result.isError === true
    );
}

function targetIsLoadedRangeMiss(
    target: ChatMessageJumpTarget,
    messages: readonly ChatMessageJumpTarget[] | undefined
) {
    const oldestLoadedSequence = getOldestSequence(messages);
    return oldestLoadedSequence !== undefined && target.sequence >= oldestLoadedSequence;
}

function showNavigationFailure(target: ChatMessageJumpTarget) {
    toast.danger('Could not find that message', {
        description: `Message ${target.id} is no longer available in this Chat.`,
    });
}
