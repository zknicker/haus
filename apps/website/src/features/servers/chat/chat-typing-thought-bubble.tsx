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
 * The engaged Agent's latest thought for this Chat, held for one spring-in
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

    // An extension is not a new bubble: it keeps the bubble's key, so no re-entry,
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
const tailWidth = 16;

/** The rim is traced around body and tail together, so the two read as one shape. */
const silhouette = [
    'drop-shadow(0 0.5px 0 var(--thought-bubble-rim))',
    'drop-shadow(0 -0.5px 0 var(--thought-bubble-rim))',
    'drop-shadow(0.5px 0 0 var(--thought-bubble-rim))',
    'drop-shadow(-0.5px 0 0 var(--thought-bubble-rim))',
    'drop-shadow(0 8px 14px var(--thought-bubble-lift))',
].join(' ');

/**
 * A small speech bubble whose tail points down at the thinking Agent's
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

    // Grows out of the tail with one small spring while a slight blur settles;
    // the words trail the shape in so the bubble lands before it is read.
    return (
        <motion.span
            animate={
                reduceMotion ? { opacity: 1 } : { filter: 'blur(0px)', opacity: 1, scale: 1, y: 0 }
            }
            className="absolute block w-max max-w-[280px]"
            data-slot="chat-typing-thought"
            exit={
                reduceMotion
                    ? { opacity: 0, transition: { duration: 0.2 } }
                    : {
                          filter: 'blur(2px)',
                          opacity: 0,
                          scale: 0.95,
                          transition: { duration: exit, ease: [0.4, 0, 1, 1] },
                          y: 3,
                      }
            }
            initial={
                reduceMotion
                    ? { opacity: 0 }
                    : { filter: 'blur(3px)', opacity: 0, scale: 0.86, y: 5 }
            }
            style={{
                bottom: anchor ? `calc(100% - ${anchor.y - 9}px)` : '100%',
                left: (anchor?.x ?? tailInset) - tailInset,
                transformOrigin: `${tailInset}px calc(100% + 6px)`,
                visibility: anchor ? 'visible' : 'hidden',
            }}
            transition={
                reduceMotion
                    ? { duration: 0.2 }
                    : {
                          filter: { duration: 0.22, ease: 'easeOut' },
                          opacity: { duration: 0.14, ease: 'easeOut' },
                          scale: { bounce: 0.3, type: 'spring', visualDuration: enter * 0.75 },
                          y: { bounce: 0.3, type: 'spring', visualDuration: enter * 0.75 },
                      }
            }
        >
            <span className="relative block" style={{ filter: silhouette }}>
                <span className="block rounded-[12px] bg-thought-bubble px-[11px] py-[7px] text-[13px] text-foreground leading-[18px]">
                    <motion.span
                        animate={{ opacity: 1, y: 0 }}
                        className="line-clamp-2"
                        initial={reduceMotion ? false : { opacity: 0, y: 3 }}
                        transition={{ delay: 0.07, duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
                    >
                        {thought.text}
                    </motion.span>
                </span>
                <svg
                    aria-hidden="true"
                    className="absolute top-[calc(100%-1px)] block h-[7px] fill-thought-bubble"
                    style={{ left: tailInset - tailWidth / 2, width: tailWidth }}
                    viewBox="0 0 16 7"
                >
                    <path d="M0 0C4.5 0 6 7 8 7S11.5 0 16 0Z" />
                </svg>
            </span>
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
