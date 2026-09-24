import { motion, useReducedMotion } from 'framer-motion';
import * as React from 'react';
import {
    admitChatTypingLaunch,
    type ChatTypingFace,
    type ChatTypingLaunchPath,
    planChatTypingLaunch,
} from './chat-typing-launch.ts';

interface ChatTypingLaunch {
    face: ChatTypingFace;
    id: number;
    origin: { x: number; y: number };
    path: ChatTypingLaunchPath;
}

export interface ChatTypingLauncher {
    dotsRef: React.RefObject<HTMLSpanElement | null>;
    finish: (id: number) => void;
    launch: (face: ChatTypingFace) => void;
    launches: readonly ChatTypingLaunch[];
    stripRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Transient faces launched from the typing dots. They are presentation only:
 * never cached, dropped when throttled, and discarded on unmount.
 */
export function useChatTypingLauncher(): ChatTypingLauncher {
    const [launches, setLaunches] = React.useState<readonly ChatTypingLaunch[]>([]);
    const dotsRef = React.useRef<HTMLSpanElement | null>(null);
    const stripRef = React.useRef<HTMLDivElement | null>(null);
    const gate = React.useRef({
        direction: 1 as 1 | -1,
        inFlight: 0,
        lastLaunchAt: null as number | null,
        lastOrigin: null as { x: number; y: number } | null,
        nextId: 0,
    });

    const launch = React.useCallback((face: ChatTypingFace) => {
        const state = gate.current;
        const now = performance.now();
        // The dots are gone once typing ends; a reply's face still rises from
        // where they were.
        const origin = measureDotsCenter(stripRef.current, dotsRef.current) ?? state.lastOrigin;
        if (!(origin && admitChatTypingLaunch(state, now, face))) {
            return;
        }
        const path = planChatTypingLaunch(state.direction);
        state.direction = path.dx < 0 ? -1 : 1;
        state.inFlight += 1;
        state.lastLaunchAt = now;
        state.lastOrigin = origin;
        state.nextId += 1;
        const next = { face, id: state.nextId, origin, path };
        setLaunches((current) => [...current, next]);
    }, []);

    const finish = React.useCallback((id: number) => {
        gate.current.inFlight = Math.max(0, gate.current.inFlight - 1);
        setLaunches((current) => current.filter((item) => item.id !== id));
    }, []);

    return { dotsRef, finish, launch, launches, stripRef };
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
                <span
                    className="absolute flex size-5 items-center justify-center"
                    data-slot="chat-typing-launch"
                    key={item.id}
                    style={{ left: item.origin.x - 10, top: item.origin.y - 10 }}
                >
                    {reduceMotion ? (
                        <ReducedLaunch item={item} onDone={() => finish(item.id)} />
                    ) : (
                        <ArcLaunch item={item} onDone={() => finish(item.id)} />
                    )}
                </span>
            ))}
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
