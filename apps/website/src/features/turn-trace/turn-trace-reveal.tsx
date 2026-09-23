import { motion, type Transition, useReducedMotion } from 'motion/react';
import type * as React from 'react';
import { springs } from '../../lib/springs.ts';

/**
 * How trace content arrives: its height opens on the shared no-bounce spring
 * so whatever sits below slides rather than jumps, and the content fades in
 * with it on the transcript's step-entrance curve (`.chat-step-enter`, 180ms).
 * A delayed fade left an empty box open for a beat. Nothing moves or scales;
 * reduced motion places it at once.
 */
export function turnTraceRevealTransition(reducedMotion: boolean | null): Transition {
    if (reducedMotion) {
        return { duration: 0 };
    }
    return {
        height: springs.drawer,
        opacity: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
    };
}

/**
 * Wraps content that appears after its surroundings have painted: a trace the
 * relay answered after its row opened, or a step a live turn just added. Under
 * `AnimatePresence initial={false}`, content present at first render does not
 * animate at all.
 */
export function TurnTraceReveal({
    children,
    className,
    ...props
}: {
    children: React.ReactNode;
    className?: string;
    'data-trace-anchor'?: string;
}) {
    const reducedMotion = useReducedMotion();

    return (
        <motion.div
            animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
            className={className}
            // Clipped only while it grows, so a settled row keeps its focus ring.
            initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
            transition={turnTraceRevealTransition(reducedMotion)}
            {...props}
        >
            {children}
        </motion.div>
    );
}
