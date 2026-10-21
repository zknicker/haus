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
                <span
                    aria-hidden="true"
                    className={cn('absolute -top-2 left-3 size-2 rounded-full border', fill)}
                />
                <span
                    aria-hidden="true"
                    className={cn('absolute -top-3.5 left-1 size-1.5 rounded-full border', fill)}
                />
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

const tones: Record<OutcomeBubbleTone, string> = {
    dream: 'border-dream/30 bg-dream-soft',
    report: 'border-accent/30 bg-accent-soft',
};
