import type { ChatEngagement } from '@haus/api';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import * as React from 'react';
import { useChatThoughtListener } from '../../../hooks/servers/use-chat-thought-listener.ts';
import {
    type ChatTypingThought,
    type ChatTypingThoughtOnScreen,
    type ChatTypingThoughts,
    chatTypingThoughtDelay,
    chatTypingThoughtHoldMs,
    chatTypingThoughtTiming,
    resolveChatTypingThought,
    resolveChatTypingThoughtArrival,
    visibleChatTypingThought,
} from './chat-typing-thought.ts';

/**
 * The engaged Agent's latest thought for this Chat, held for one wobble-in
 * and hold; the same line again while it is up extends that hold instead.
 * The last shown thought stays recallable until its run stops engaging the
 * Chat. Transient state only: never cached, gone on unmount.
 */
export function useChatTypingThought(
    serverId: string,
    chatId: string | undefined,
    engagements: readonly Pick<ChatEngagement, 'agentId' | 'runId'>[]
): ChatTypingThoughts {
    const [thought, setThought] = React.useState<ChatTypingThought | null>(null);
    const [latest, setLatest] = React.useState<ChatTypingThought | null>(null);
    const nextId = React.useRef(0);
    const lastShownAt = React.useRef<number | null>(null);
    // Engagements (Agent and run) that have shown a bubble here.
    const shownEngagements = React.useRef(new Set<string>());
    const onScreen = React.useRef<ChatTypingThoughtOnScreen | null>(null);
    const holdTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const waitTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const holdUntil = React.useCallback((next: ChatTypingThought, hideAt: number) => {
        clearTimeout(holdTimer.current);
        holdTimer.current = setTimeout(() => {
            onScreen.current = null;
            setThought((current) => (current?.id === next.id ? null : current));
        }, hideAt - performance.now());
    }, []);

    // An extension is not a new bubble: it keeps the bubble's key, so no wobble,
    // and leaves the spacing mark where the bubble first showed.
    const present = React.useCallback(
        (next: ChatTypingThought) => {
            const now = performance.now();
            const arrival = resolveChatTypingThoughtArrival(onScreen.current, next, now);
            if (arrival.kind === 'absorb') {
                return;
            }
            if (arrival.kind === 'extend' && onScreen.current) {
                onScreen.current = { ...onScreen.current, hideAt: arrival.hideAt };
                holdUntil(onScreen.current.thought, arrival.hideAt);
                return;
            }
            const hideAt =
                now + chatTypingThoughtTiming.enterMs + chatTypingThoughtHoldMs(next.text);
            lastShownAt.current = now;
            shownEngagements.current.add(`${next.agentId}:${next.runId}`);
            onScreen.current = { hideAt, shownAt: now, thought: next };
            setThought(next);
            setLatest(next);
            holdUntil(next, onScreen.current.hideAt);
        },
        [holdUntil]
    );

    useChatThoughtListener(serverId, chatId, (event) => {
        nextId.current += 1;
        const next = resolveChatTypingThought(engagements, event, nextId.current);
        if (!next) {
            return;
        }
        // Newest wins: a thought still waiting for its turn is replaced.
        clearTimeout(waitTimer.current);
        // The line already on screen extends at once rather than waiting to re-enter.
        if (
            resolveChatTypingThoughtArrival(onScreen.current, next, performance.now()).kind !==
            'show'
        ) {
            present(next);
            return;
        }
        const delay = chatTypingThoughtDelay(
            lastShownAt.current,
            performance.now(),
            !shownEngagements.current.has(`${next.agentId}:${next.runId}`)
        );
        if (delay === 0) {
            present(next);
        } else {
            waitTimer.current = setTimeout(() => present(next), delay);
        }
    });
    React.useEffect(
        () => () => {
            clearTimeout(holdTimer.current);
            clearTimeout(waitTimer.current);
        },
        []
    );

    // Recall belongs to one engagement: drop it the moment its run stops engaging.
    const engagedLatest = visibleChatTypingThought(engagements, latest);
    if (latest && !engagedLatest) {
        setLatest(null);
    }
    return { latest: engagedLatest, live: visibleChatTypingThought(engagements, thought) };
}

const tailInset = 14;

/**
 * A small glass speech bubble whose tail points down at the thinking Agent's
 * avatar in the strip. It overlays the transcript, never takes layout, never
 * takes the pointer, and sits beneath the launched faces.
 */
export function ChatTypingThoughtBubble({
    stripRef,
    thought,
}: {
    stripRef: React.RefObject<HTMLElement | null>;
    thought: ChatTypingThought | null;
}) {
    return (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
            <AnimatePresence>
                {thought ? (
                    <ThoughtBubble key={thought.id} stripRef={stripRef} thought={thought} />
                ) : null}
            </AnimatePresence>
        </span>
    );
}

function ThoughtBubble({
    stripRef,
    thought,
}: {
    stripRef: React.RefObject<HTMLElement | null>;
    thought: ChatTypingThought;
}) {
    const reduceMotion = useReducedMotion() === true;
    const [anchor, setAnchor] = React.useState<{ x: number; y: number } | null>(null);
    React.useLayoutEffect(() => {
        setAnchor(measureAvatarTop(stripRef.current, thought.agentId));
    }, [stripRef, thought.agentId]);
    const enter = chatTypingThoughtTiming.enterMs / 1000;
    const exit = chatTypingThoughtTiming.exitMs / 1000;

    return (
        <motion.span
            animate={
                reduceMotion
                    ? { opacity: 1 }
                    : {
                          opacity: [0, 1, 1],
                          rotate: [-3, 1.5, -0.6, 0],
                          scale: [0.9, 1.03, 1],
                          y: [6, -1, 0],
                      }
            }
            className="absolute block w-max max-w-[280px] rounded-[14px] border border-thought-glass-border bg-thought-glass px-2.5 py-1.5 text-[13px] text-foreground leading-[18px] shadow-(--thought-glass-shadow) backdrop-blur-[14px] backdrop-saturate-[1.6]"
            data-slot="chat-typing-thought"
            exit={
                reduceMotion
                    ? { opacity: 0, transition: { duration: exit } }
                    : {
                          opacity: 0,
                          rotate: -1.5,
                          scale: 0.94,
                          transition: { duration: exit, ease: 'easeIn' },
                          y: 4,
                      }
            }
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -3, scale: 0.9, y: 6 }}
            style={{
                bottom: anchor ? `calc(100% - ${anchor.y - 7}px)` : '100%',
                left: (anchor?.x ?? tailInset) - tailInset,
                transformOrigin: `${tailInset}px 100%`,
                visibility: anchor ? 'visible' : 'hidden',
            }}
            transition={
                reduceMotion
                    ? { duration: 0.2 }
                    : {
                          duration: enter,
                          opacity: { duration: enter * 0.4, times: [0, 0.6, 1] },
                          rotate: { duration: enter, times: [0, 0.4, 0.7, 1] },
                          scale: { duration: enter, times: [0, 0.55, 1] },
                          y: { duration: enter, times: [0, 0.55, 1] },
                      }
            }
        >
            <span className="line-clamp-2">{thought.text}</span>
            <span
                className="absolute -bottom-[5px] size-2.5 rotate-45 border-thought-glass-border border-r border-b bg-thought-glass backdrop-blur-[14px] [clip-path:polygon(100%_0,100%_100%,0_100%)]"
                style={{ left: tailInset - 5 }}
            />
        </motion.span>
    );
}

/** The thinking Agent's avatar top-center in strip coordinates; its dots when the avatar is not shown. */
function measureAvatarTop(strip: HTMLElement | null, agentId: string) {
    const target =
        strip?.querySelector<HTMLElement>(`[data-typist-avatar="${CSS.escape(agentId)}"]`) ??
        strip?.querySelector<HTMLElement>('[data-slot="chat-loader-dots"]');
    if (!(strip && target)) {
        return null;
    }
    const stripBox = strip.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return { x: box.left + box.width / 2 - stripBox.left, y: box.top - stripBox.top };
}
