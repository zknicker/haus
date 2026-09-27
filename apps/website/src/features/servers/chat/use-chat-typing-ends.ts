import type { ChatMessage } from '@haus/api';
import * as React from 'react';
import { useChatMessages } from '../../../hooks/servers/use-chat-messages.ts';
import {
    type ChatEngagementEnd,
    type ChatTypingHold,
    releaseChatTypingHolds,
    resolveChatTypingEnd,
} from './chat-typing-hold.ts';
import { type ChatTypingFace, chatTypingSentFace } from './chat-typing-launch.ts';

const noMessages: readonly ChatMessage[] = [];

/**
 * Presents each ended engagement: its face, and for a `--done` reply, the
 * Agent's dots held until the reply is in this Chat's transcript cache (or
 * the hold times out), with 😊 launched as it lands. Reacts to the cache and
 * the end event only; the one timer is the hold's deadline.
 */
export function useChatTypingEnds(
    serverId: string,
    chatId: string | undefined,
    launch: (face: ChatTypingFace) => void
) {
    const messages = useChatMessages(serverId, chatId).data?.messages ?? noMessages;
    const [holds, setHolds] = React.useState<readonly ChatTypingHold[]>([]);
    const latestMessages = React.useRef(messages);
    React.useEffect(() => {
        latestMessages.current = messages;
    }, [messages]);

    const onEnded = React.useCallback(
        (end: ChatEngagementEnd) => {
            const outcome = resolveChatTypingEnd(end, latestMessages.current, Date.now());
            if (outcome.kind === 'face') {
                launch(outcome.face);
            } else if (outcome.kind === 'hold') {
                setHolds((current) => [...current, outcome.hold]);
            }
        },
        [launch]
    );

    const chatHolds = React.useMemo(
        () => holds.filter((hold) => hold.end.chatId === chatId),
        [chatId, holds]
    );

    // Runs after the render that still shows the held dots, so 😊 rises from them.
    React.useEffect(() => {
        if (holds.length === 0) {
            return;
        }
        const release = (transcript: readonly ChatMessage[]) => {
            const { kept, released } = releaseChatTypingHolds(chatHolds, transcript, Date.now());
            for (const _ of released) {
                launch(chatTypingSentFace);
            }
            if (released.length > 0 || kept.length !== holds.length) {
                setHolds(kept);
            }
            return kept;
        };
        const kept = release(messages);
        if (kept.length === 0 || kept.length !== holds.length) {
            return;
        }
        const nextDeadline = Math.min(...kept.map((hold) => hold.expiresAt));
        const timer = setTimeout(
            () => release(latestMessages.current),
            Math.max(0, nextDeadline - Date.now())
        );
        return () => clearTimeout(timer);
    }, [chatHolds, holds.length, launch, messages]);

    return { holds: chatHolds, onEnded };
}
