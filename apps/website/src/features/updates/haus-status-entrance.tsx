import { motion, type TargetAndTransition, type Transition, useReducedMotion } from 'motion/react';
import type * as React from 'react';
import { springs } from '../../lib/springs.ts';

export interface HausStatusEntranceMotion {
    animate: TargetAndTransition;
    exit: TargetAndTransition;
    initial: TargetAndTransition;
    transition: Transition;
}

/** The transcript's ease-out entrance curve (`.chat-step-enter`). */
const easeOut = [0.23, 1, 0.32, 1] as const;
const easeIn = [0.7, 0, 0.84, 0] as const;

/**
 * How a sidebar status button arrives and leaves. It rises a few pixels and
 * grows from 85% on a spring with one small overshoot, so a status that shows
 * up after the page painted catches the eye once and then rests; it never
 * loops. Leaving is a quick shrink-and-fade. Reduced motion keeps the fade
 * and drops every transform.
 */
export function hausStatusEntranceMotion(reducedMotion: boolean | null): HausStatusEntranceMotion {
    if (reducedMotion) {
        return {
            animate: { opacity: 1 },
            exit: { opacity: 0, transition: { duration: 0.12, ease: 'linear' } },
            initial: { opacity: 0 },
            transition: { duration: 0.18, ease: 'linear' },
        };
    }
    return {
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: {
            opacity: 0,
            scale: 0.85,
            transition: { duration: 0.16, ease: easeIn },
        },
        initial: { opacity: 0, scale: 0.85, y: 6 },
        transition: {
            default: { type: 'spring', duration: 0.42, bounce: 0.3 },
            layout: springs.drawer,
            opacity: { duration: 0.18, ease: easeOut },
        },
    };
}

/**
 * Animates one status button in when it first mounts and out when it unmounts
 * under the footer's `AnimatePresence`. It owns transform and opacity only;
 * re-renders of a mounted button (phase, donut progress) never replay it.
 * `layout="position"` lets a remaining sibling slide over instead of jumping.
 */
export function HausStatusEntrance({ children }: { children: React.ReactNode }) {
    const reducedMotion = useReducedMotion();
    const entrance = hausStatusEntranceMotion(reducedMotion);
    return (
        <motion.div
            animate={entrance.animate}
            className="flex"
            exit={entrance.exit}
            initial={entrance.initial}
            layout={reducedMotion ? false : 'position'}
            transition={entrance.transition}
        >
            {children}
        </motion.div>
    );
}
