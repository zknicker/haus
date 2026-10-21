import { motion, useReducedMotion } from 'framer-motion';
import type * as React from 'react';
import { cn } from '../../../../lib/utils.ts';

export type OutcomeBubbleTone = 'danger' | 'dream' | 'muted' | 'report';

/**
 * One run's outcome as a bubble from the Agent in the row header, in the
 * channel typing bubble's language (glass fill, hairline edge, soft lift). A
 * speech bubble's tail points up at the avatar; a thought bubble trails dots.
 * The bubble is the container: no card inside it.
 */
export function OutcomeBubble({
    children,
    compact = false,
    shape = 'speech',
    tone,
}: {
    children: React.ReactNode;
    /** A small, quiet bubble for runs with nothing to say. */
    compact?: boolean;
    shape?: 'speech' | 'thought';
    tone: OutcomeBubbleTone;
}) {
    const reduceMotion = useReducedMotion() === true;
    const { fill, text } = tones[tone];
    return (
        <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
                'relative flex w-fit max-w-full items-start gap-2 rounded-2xl border shadow-(--thought-glass-shadow)',
                shape === 'thought' ? 'mt-3.5' : 'mt-2',
                compact ? 'items-center px-2.5 py-1' : 'px-3 py-2',
                fill,
                text
            )}
            data-slot="heartbeat-outcome-bubble"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
            style={{ transformOrigin: '14px 0' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
        >
            {shape === 'thought' ? (
                <>
                    <span
                        aria-hidden="true"
                        className={cn('absolute -top-2 left-3 size-2 rounded-full border', fill)}
                    />
                    <span
                        aria-hidden="true"
                        className={cn(
                            'absolute -top-3.5 left-1 size-1.5 rounded-full border',
                            fill
                        )}
                    />
                </>
            ) : (
                <span
                    aria-hidden="true"
                    className={cn(
                        'absolute -top-[5px] left-3.5 size-2.5 rotate-45 border-t border-l [clip-path:polygon(0_0,100%_0,0_100%)]',
                        fill
                    )}
                />
            )}
            {children}
        </motion.div>
    );
}

const tones: Record<OutcomeBubbleTone, { fill: string; text: string }> = {
    danger: { fill: 'border-danger/30 bg-danger-soft', text: 'text-foreground' },
    dream: { fill: 'border-dream/30 bg-dream-soft', text: 'text-foreground' },
    muted: { fill: 'border-thought-glass-border bg-thought-glass', text: 'text-muted' },
    report: { fill: 'border-accent/30 bg-accent-soft', text: 'text-foreground' },
};
