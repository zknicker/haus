import type { CloudAgentJobState } from '@haus/api';
import { Spinner } from '@heroui/react';
import { cn } from '../../lib/utils.ts';
import { type CloudAgentTone, cloudAgentJobTone } from './cloud-agent-presentation.ts';

// A literal size, not a spacing step: a status glyph should not shrink because
// the row around it tightened. 16px is the app's icon size, so a trailing disc
// reads at the weight of the glyphs beside it; a chip passes its own smaller box.
const glyphSize = 'size-[16px]';

const settledGlyphs = {
    done: 'M5.1 8.3l2 2 3.8-4.2',
    ended: 'M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2',
    'pending-input': 'M6.2 6.4a1.85 1.85 0 1 1 2.6 1.7c-.5.25-.8.6-.8 1.15v.2M8 11.3v.05',
};

const toneClasses: Record<CloudAgentTone, string> = {
    accent: 'text-accent',
    danger: 'text-danger',
    muted: 'text-muted',
    success: 'text-success',
    warning: 'text-warning',
};

/**
 * The Cloud Agent job's one point of lifecycle color: HeroUI's own spinner
 * while it works, and a solid disc once it settles: a check when done, a
 * question mark while it waits on an answer, otherwise a cross.
 */
export function CloudAgentStatusDisc({
    className,
    state,
}: {
    className?: string;
    state: CloudAgentJobState;
}) {
    const toneClass = toneClasses[cloudAgentJobTone(state)];

    if (state === 'working') {
        return (
            <span
                aria-hidden="true"
                className={cn(
                    glyphSize,
                    'inline-flex shrink-0 items-center justify-center',
                    toneClass,
                    className
                )}
            >
                {/* Sized to the glyph box, so a working chip is exactly as
                    tall as a settled one and the card never shifts. */}
                <Spinner className="size-full" color="current" size="sm" />
            </span>
        );
    }

    return (
        <svg
            aria-hidden="true"
            className={cn(glyphSize, 'shrink-0', toneClass, className)}
            viewBox="0 0 16 16"
        >
            <circle cx="8" cy="8" fill="currentColor" r="6.75" />
            {/* var(--surface), not white: the disc fills with a theme token,
                and a white glyph washes out on it. */}
            <path
                d={settledGlyphs[state === 'done' || state === 'pending-input' ? state : 'ended']}
                fill="none"
                stroke="var(--surface)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
            />
        </svg>
    );
}
