import type * as React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * The one line above a turn's identity that says what it answers — an
 * automation fire or a reply parent — at the avatar rail's indent, with an
 * elbow from the line's mark down to the author's avatar. The line owns the top
 * padding; `transcriptTurnGeometry.row` opens to `pt-3` after it.
 *
 * The elbow stops short of both avatars, like a reply connector: its arm ends a
 * few pixels before the 20px mark and its stem a few pixels above the author's
 * avatar. The avatar rail is in `--spacing` units while the 20px row and the
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
                    // Stroke centered on the 20px row's midline; the arm stops 3px before
                    // the mark (pl-11) and the stem ~3px above the author avatar's top,
                    // which the row's pt-3 puts about as far down as the arm is long.
                    'absolute top-[calc(var(--spacing)*2+9px)] left-4 h-[calc(var(--spacing)*4+7px)] w-[calc(var(--spacing)*7-3px)] rounded-tl-lg border-t-2 border-l-2',
                    elbowClassName
                )}
                data-turn-context-elbow=""
            />
            {children}
        </div>
    );
}

/**
 * The row inside a context line: a 20px mark, then single-line text at the
 * message body's size, held to the mark's height so the elbow's midline holds.
 */
export const turnContextLineContentClassName =
    'flex h-5 min-w-0 items-center gap-2 text-left text-base leading-5';

/** The leading mark's box: a reply's author avatar or an automation's keycap. */
export const turnContextMarkSize = 20;
