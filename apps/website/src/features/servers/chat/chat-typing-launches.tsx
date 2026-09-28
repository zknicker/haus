import { motion, useReducedMotion } from 'framer-motion';
import * as React from 'react';
import type { ChatTypingFace } from './chat-typing-launch.ts';
import {
    type ChatTypingLaunch,
    type ChatTypingLaunchQueue,
    createChatTypingLaunchQueue,
    isStaleChatTypingLaunch,
} from './chat-typing-launch-queue.ts';

export interface ChatTypingLauncher {
    dotsRef: React.RefObject<HTMLSpanElement | null>;
    finish: (id: number) => void;
    launch: (face: ChatTypingFace) => void;
    launches: readonly ChatTypingLaunch[];
    stripRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Faces launch only while the page is in view: a hidden page drops them, and
 * one whose animation could not start promptly is dropped, never replayed.
 */
export function useChatTypingLauncher(): ChatTypingLauncher {
    const dotsRef = React.useRef<HTMLSpanElement | null>(null);
    const stripRef = React.useRef<HTMLDivElement | null>(null);
    const [queue] = React.useState(() =>
        createChatTypingLaunchQueue({
            isHidden: () => document.visibilityState === 'hidden',
            measure: () => measureDotsCenter(stripRef.current, dotsRef.current),
            now: () => performance.now(),
            schedule: (run, delayMs) => {
                const timer = setTimeout(run, delayMs);
                return () => clearTimeout(timer);
            },
        })
    );
    const launches = React.useSyncExternalStore(
        queue.subscribe,
        queue.getSnapshot,
        queue.getSnapshot
    );
    useDropLaunchesWhenHidden(queue);
    return {
        dotsRef,
        finish: queue.finish,
        launch: queue.launch,
        launches,
        stripRef,
    };
}

function useDropLaunchesWhenHidden(queue: ChatTypingLaunchQueue) {
    React.useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                queue.drop();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            queue.dispose();
        };
    }, [queue]);
}

/** Rises over the transcript from inside the strip without affecting layout. */
export function ChatTypingLaunches({
    finish,
    launches,
}: Pick<ChatTypingLauncher, 'finish' | 'launches'>) {
    const reduceMotion = useReducedMotion() === true;
    if (launches.length === 0) {
        return null;
    }
    return (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
            {launches.map((item) => (
                <LaunchSlot finish={finish} item={item} key={item.id}>
                    {reduceMotion ? (
                        <ReducedLaunch item={item} onDone={() => finish(item.id)} />
                    ) : (
                        <ArcLaunch item={item} onDone={() => finish(item.id)} />
                    )}
                </LaunchSlot>
            ))}
        </span>
    );
}

function LaunchSlot({
    children,
    finish,
    item,
}: {
    children: React.ReactNode;
    finish: (id: number) => void;
    item: ChatTypingLaunch;
}) {
    // Motion runs on animation frames. A late first frame means frames stalled
    // while this face waited, as in a blurred or occluded window: drop it
    // rather than play it with every other stalled face.
    const { admittedAt, id } = item;
    React.useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (isStaleChatTypingLaunch({ admittedAt }, performance.now())) {
                finish(id);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [admittedAt, finish, id]);
    return (
        <span
            className="absolute flex size-5 items-center justify-center"
            data-slot="chat-typing-launch"
            style={{ left: item.origin.x - 10, top: item.origin.y - 10 }}
        >
            {children}
        </span>
    );
}

function ArcLaunch({ item, onDone }: { item: ChatTypingLaunch; onDone: () => void }) {
    const { dx, durationMs, rise, rotate } = item.path;
    const duration = durationMs / 1000;
    return (
        <motion.span
            animate={{ x: dx }}
            className="block"
            initial={{ x: 0 }}
            transition={{ duration, ease: [0.35, 0.1, 0.6, 1] }}
        >
            <motion.span
                animate={{
                    opacity: [0, 1, 1, 0],
                    rotate: [0, rotate * 0.6, rotate],
                    scale: [0.6, 1.1, 0.94, 0.9],
                    y: -rise,
                }}
                className={faceClassName}
                initial={{ opacity: 0, rotate: 0, scale: 0.6, y: 0 }}
                onAnimationComplete={onDone}
                transition={{
                    opacity: { duration, times: [0, 0.1, 0.55, 1] },
                    rotate: { duration, times: [0, 0.35, 1] },
                    scale: { duration, times: [0, 0.2, 0.42, 1] },
                    y: { duration, ease: [0.12, 0.75, 0.3, 1] },
                }}
            >
                {item.face}
            </motion.span>
        </motion.span>
    );
}

function ReducedLaunch({ item, onDone }: { item: ChatTypingLaunch; onDone: () => void }) {
    return (
        <motion.span
            animate={{ opacity: [0, 1, 1, 0] }}
            className={faceClassName}
            initial={{ opacity: 0, y: -20 }}
            onAnimationComplete={onDone}
            transition={{ duration: 1, times: [0, 0.2, 0.7, 1] }}
        >
            {item.face}
        </motion.span>
    );
}

const faceClassName =
    'block select-none text-[20px] leading-none [font-family:"Apple_Color_Emoji","Segoe_UI_Emoji","Noto_Color_Emoji",sans-serif]';

function measureDotsCenter(strip: HTMLElement | null, dots: HTMLElement | null) {
    if (!(strip && dots)) {
        return null;
    }
    const stripBox = strip.getBoundingClientRect();
    const dotsBox = dots.getBoundingClientRect();
    return {
        x: dotsBox.left + dotsBox.width / 2 - stripBox.left,
        y: dotsBox.top + dotsBox.height / 2 - stripBox.top,
    };
}
