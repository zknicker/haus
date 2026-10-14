import type { TargetAndTransition, Transition } from 'motion/react';

/** The transcript's ease-out entrance curve (`.chat-step-enter`). */
const easeOut = [0.23, 1, 0.32, 1] as const;

/** Each later card in a strip starts this much after the one before it, up to a cap. */
const staggerSeconds = 0.05;
const maxStaggerSeconds = 0.3;

/**
 * How a card for a running job arrives: it fades up a few pixels on the
 * transcript's ease-out, and a strip's cards follow one another left to
 * right, so a batch reads as a sequence instead of a block that pops in.
 * Reduced motion keeps a short fade and drops the rise and the stagger.
 */
export function imageGenerationEntrance(
    index: number,
    reduceMotion: boolean | null
): { animate: TargetAndTransition; initial: TargetAndTransition; transition: Transition } {
    if (reduceMotion) {
        return {
            animate: { opacity: 1 },
            initial: { opacity: 0 },
            transition: { duration: 0.15, ease: 'linear' },
        };
    }
    return {
        animate: { opacity: 1, y: 0 },
        initial: { opacity: 0, y: 6 },
        transition: {
            delay: Math.min(index * staggerSeconds, maxStaggerSeconds),
            duration: 0.28,
            ease: easeOut,
        },
    };
}

/** How a finished image replaces the shimmer: a calm crossfade with a hint of focus, never a cut. */
export function imageGenerationReveal(reduceMotion: boolean | null): {
    animate: TargetAndTransition;
    initial: TargetAndTransition;
    transition: Transition;
} {
    if (reduceMotion) {
        return {
            animate: { opacity: 1 },
            initial: { opacity: 0 },
            transition: { duration: 0.15, ease: 'linear' },
        };
    }
    return {
        animate: { opacity: 1, scale: 1 },
        initial: { opacity: 0, scale: 1.03 },
        transition: { duration: 0.36, ease: easeOut },
    };
}
