import { motion, useReducedMotion } from 'framer-motion';
import type * as React from 'react';
import { cn } from '../../../../lib/utils.ts';

export type OutcomeBubbleTone = 'dream' | 'report';

/**
 * One thought from the Agent leading a post, in the channel typing bubble's
 * language (glass fill, hairline edge, soft lift). A speech bubble's tail points
 * up at the avatar; a thought bubble trails dots. Only the first bubble of a
 * stack carries its `tail`, like the first of consecutive chat messages. Errors
 * are never bubbles: a bubble is something the Agent learned or thought.
 */
export function OutcomeBubble({
    children,
    hasTail,
    shape,
    tone,
}: {
    children: React.ReactNode;
    hasTail: boolean;
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
            style={{ transformOrigin: '14px 0' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
        >
            {hasTail ? <Tail fill={fill} shape={shape} /> : null}
            {children}
        </motion.div>
    );
}

function Tail({ fill, shape }: { fill: string; shape: 'speech' | 'thought' }) {
    if (shape === 'thought') {
        return (
            <>
                <ThoughtDot diameter={8} fill={fill} left={12} top={-12} />
                <ThoughtDot diameter={5} fill={fill} left={6} top={-21} />
            </>
        );
    }
    return (
        <span
            aria-hidden="true"
            className={cn(
                'absolute -top-[5px] left-3.5 size-2.5 rotate-45 border-t border-l [clip-path:polygon(0_0,100%_0,0_100%)]',
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
