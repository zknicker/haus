import { motion, useReducedMotion } from 'framer-motion';
import type * as React from 'react';
import { cn } from '../../../../lib/utils.ts';

export type OutcomeBubbleTone = 'dream' | 'report';

/**
 * One thought from the Agent leading a post, in the channel typing bubble's
 * language (glass fill, hairline edge, soft lift). Every bubble carries its own
 * tail on the left, toward the avatar: a speech bubble a small triangle, a
 * thought bubble trailing dots. Errors are never bubbles: a bubble is something
 * the Agent learned or thought.
 */
export function OutcomeBubble({
    children,
    shape,
    tone,
}: {
    children: React.ReactNode;
    shape: 'speech' | 'thought';
    tone: OutcomeBubbleTone;
}) {
    const reduceMotion = useReducedMotion() === true;
    const fill = tones[tone];
    return (
        <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
                'relative w-fit max-w-full rounded-2xl border px-3 py-2 shadow-(--thought-glass-shadow)',
                fill
            )}
            data-slot="heartbeat-outcome-bubble"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            style={{ transformOrigin: '0 14px' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
        >
            <Tail fill={fill} shape={shape} />
            {children}
        </motion.div>
    );
}

/** Beside the first text line, pointing left at the avatar column. */
function Tail({ fill, shape }: { fill: string; shape: 'speech' | 'thought' }) {
    if (shape === 'thought') {
        return (
            <>
                <ThoughtDot diameter={8} fill={fill} left={-12} top={9} />
                <ThoughtDot diameter={5} fill={fill} left={-19} top={14} />
            </>
        );
    }
    return (
        <span
            aria-hidden="true"
            className={cn(
                'absolute top-2.5 -left-[5px] size-2.5 rotate-45 border-b border-l [clip-path:polygon(0_0,100%_100%,0_100%)]',
                fill
            )}
        />
    );
}

/** A perfect circle: equal fixed width and height, never flexed or stretched. */
function ThoughtDot({
    diameter,
    fill,
    left,
    top,
}: {
    diameter: number;
    fill: string;
    left: number;
    top: number;
}) {
    return (
        <span
            aria-hidden="true"
            className={cn('absolute box-border aspect-square flex-none rounded-full border', fill)}
            style={{
                height: diameter,
                left,
                minHeight: diameter,
                minWidth: diameter,
                top,
                width: diameter,
            }}
        />
    );
}

const tones: Record<OutcomeBubbleTone, string> = {
    dream: 'border-dream/30 bg-dream-soft',
    report: 'border-accent/30 bg-accent-soft',
};
