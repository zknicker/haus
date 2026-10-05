import type * as React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * The one line above a turn's identity that says what it answers — an
 * automation fire or a reply parent — at the avatar rail's indent, with an
 * elbow from the line's mark down to the author's avatar. The line owns the top
 * padding; `transcriptTurnGeometry.row` takes half its own after it.
 *
 * The elbow stops short of both avatars, like a reply connector: its arm ends a
 * few pixels before the 16px mark and its stem a few pixels above the author's
 * avatar. The avatar rail is in `--spacing` units while the 16px row and the
 * 2px stroke are not, so each edge mixes the two.
 */
export function TurnContextLine({
    children,
    elbowClassName = 'border-separator',
}: {
    children: React.ReactNode;
    elbowClassName?: string;
}) {
    return (
        <div className="relative min-w-0 pt-2 pl-11" data-turn-context-line="">
            <span
                aria-hidden="true"
                className={cn(
                    // Stroke centered on the 16px row's midline; the arm stops 3px before
                    // the mark (pl-11) and the stem ~3px above the author avatar's top.
                    'absolute top-[calc(var(--spacing)*2+7px)] left-4 h-[calc(var(--spacing)*2+6px)] w-[calc(var(--spacing)*7-3px)] rounded-tl-lg border-t-2 border-l-2',
                    elbowClassName
                )}
                data-turn-context-elbow=""
            />
            {children}
        </div>
    );
}

/** The row inside a context line: a 16px mark, then single-line text. */
export const turnContextLineContentClassName =
    'flex min-w-0 items-center gap-1.5 text-left text-xs';
