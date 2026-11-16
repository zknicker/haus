import { cn } from '../../lib/utils.ts';

// A literal size, not a spacing step: menus tighten their spacing scale, and
// a status glyph should not shrink just because the row around it did.
const glyphSize = 'size-[15px]';

import { type ClaimStatus, claimStatusDiscClasses } from '../claims/claim-presentation.ts';

// How much of the disc's inner pie is filled while a claim is live. Terminal
// states (done/closed) render as a solid disc with a glyph instead.
const discFillFraction: Record<
    Extract<ClaimStatus, 'in_progress' | 'in_review' | 'todo'>,
    number
> = {
    in_progress: 0.5,
    in_review: 0.75,
    todo: 0,
};

// Inner pie geometry: a half-radius circle with a stroke as wide as itself
// renders as a solid pie wedge via dasharray, Linear-style.
const pieRadius = 2;
const pieCircumference = 2 * Math.PI * pieRadius;

/**
 * Linear-style status disc: an outline ring that fills clockwise as the
 * claim progresses, landing on a solid check (done) or cross (closed).
 * Status hue rides the shared label tokens via `claimStatusDiscClasses`.
 */
export function TaskStatusDisc({ className, status }: { className?: string; status: ClaimStatus }) {
    if (status === 'done' || status === 'closed') {
        return (
            <svg
                aria-hidden="true"
                className={cn(glyphSize, 'shrink-0', claimStatusDiscClasses[status], className)}
                viewBox="0 0 16 16"
            >
                <circle cx="8" cy="8" fill="currentColor" r="6.75" />
                {/* var(--surface), not white: dark mode fills the disc with a
                    pastel label token, and a white glyph washes out on it. */}
                {status === 'done' ? (
                    <path
                        d="M5.1 8.3l2 2 3.8-4.2"
                        fill="none"
                        stroke="var(--surface)"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                    />
                ) : (
                    <path
                        d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2"
                        fill="none"
                        stroke="var(--surface)"
                        strokeLinecap="round"
                        strokeWidth="1.5"
                    />
                )}
            </svg>
        );
    }

    const fill = discFillFraction[status];

    return (
        <svg
            aria-hidden="true"
            className={cn(glyphSize, 'shrink-0', claimStatusDiscClasses[status], className)}
            viewBox="0 0 16 16"
        >
            <circle cx="8" cy="8" fill="none" r="6" stroke="currentColor" strokeWidth="1.5" />
            {fill > 0 ? (
                <circle
                    cx="8"
                    cy="8"
                    fill="none"
                    r={pieRadius}
                    stroke="currentColor"
                    strokeDasharray={`${fill * pieCircumference} ${pieCircumference}`}
                    strokeWidth={pieRadius * 2}
                    transform="rotate(-90 8 8)"
                />
            ) : null}
        </svg>
    );
}
