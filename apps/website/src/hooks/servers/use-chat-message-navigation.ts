import { toast } from '@heroui/react';
import * as React from 'react';

export interface ChatMessageJumpTarget {
    id: string;
    sequence: number;
}

interface NavigationSnapshot {
    chatId: string;
    fetchOlderHistory: () => Promise<unknown>;
    hasOlderHistory: boolean;
    messages: readonly ChatMessageJumpTarget[] | undefined;
}

/**
 * Reveals a message in a cursor-paginated transcript, loading older pages only
 * while the target sequence is outside the loaded range. A generation token
 * makes a pending jump harmless when the user starts another jump or changes
 * Chats before the request finishes.
 */
export function useChatMessageNavigation({
    chatId,
    fetchOlderHistory,
    hasOlderHistory,
    messages,
}: {
    chatId: string;
    fetchOlderHistory: () => Promise<unknown>;
    hasOlderHistory: boolean;
    messages: readonly ChatMessageJumpTarget[] | undefined;
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
    const snapshot = React.useRef({ chatId, fetchOlderHistory, hasOlderHistory, messages });
    snapshot.current = { chatId, fetchOlderHistory, hasOlderHistory, messages };

    const revealMessage = React.useCallback(
        (target: ChatMessageJumpTarget, scrollToMessage?: (id: string) => boolean) => {
            const generation = requestGeneration.current + 1;
            requestGeneration.current = generation;

            void revealMessageInHistory({
                generation,
                requestGeneration,
                snapshot,
                target,
                scrollToMessage,
            });
        },
        []
    );

    return { revealMessage };
}

function revealLoadedMessage(
    target: ChatMessageJumpTarget,
    scrollToMessage?: (id: string) => boolean
) {
    const escapedId = CSS.escape(target.id);
    const element = document.querySelector<HTMLElement>(`[data-message-id="${escapedId}"]`);

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
    if (revealLoadedMessage(target, scrollToMessage)) {
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
            revealLoadedMessage(target, scrollToMessage)
        ) {
            return;
        }
    }
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
