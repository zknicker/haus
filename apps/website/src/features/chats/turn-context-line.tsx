import type * as React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * The lines above a turn's identity that say what it answers: an automation
 * fire, a reply parent, or both — fire first, then the reply, so the line
 * nearest the message is the one it most directly continues. The stack owns
 * the top padding; `transcriptTurnGeometry.row` takes half its own after it.
 */
export function TurnContextLines({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col gap-1 pt-2" data-turn-context-lines="">
            {children}
        </div>
    );
}

/**
 * One context line, at the avatar rail's indent. Only the line nearest the
 * message body draws the elbow down into the avatar; a line stacked above it
 * keeps the indent without one, so two elbows never nest.
 */
export function TurnContextLine({
    children,
    elbow = true,
    elbowClassName = 'border-separator',
}: {
    children: React.ReactNode;
    elbow?: boolean;
    elbowClassName?: string;
}) {
    return (
        <div className="relative min-w-0 pl-11" data-turn-context-line="">
            {elbow ? (
                <span
                    aria-hidden="true"
                    className={cn(
                        // Starts at the 16px row's midline and turns down into the avatar.
                        'absolute top-2 left-4 size-4 rounded-tl-lg border-t-2 border-l-2',
                        elbowClassName
                    )}
                    data-turn-context-elbow=""
                />
            ) : null}
            {children}
        </div>
    );
}

/** The row inside a context line: a 16px mark, then single-line text. */
export const turnContextLineContentClassName =
    'flex min-w-0 items-center gap-1.5 text-left text-xs';
