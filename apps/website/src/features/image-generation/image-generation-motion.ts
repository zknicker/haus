import type { TargetAndTransition, Transition } from 'motion/react';
import type * as React from 'react';

/** The transcript's ease-out entrance curve (`.chat-step-enter`). */
const easeOut = [0.23, 1, 0.32, 1] as const;

/** Each later card in a Message starts this much after the one before it, up to a cap. */
const staggerMs = 50;
const maxStaggerMs = 300;

/**
 * How a card for a running job arrives: `.image-generation-enter` fades it up
 * a few pixels on the transcript's ease-out, and the Message's cards follow one
 * another left to right, so a batch reads as a sequence instead of a block
 * that pops in. The entrance is a CSS animation, not motion: the commit that
 * mounts a new Message is followed by long frames, and only a compositor
 * animation keeps advancing through them instead of skipping its start.
 */
export function imageGenerationEntranceDelay(index: number): React.CSSProperties {
    return { animationDelay: `${Math.min(index * staggerMs, maxStaggerMs)}ms` };
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
