import * as React from 'react';
import { cn } from '../../lib/utils.ts';
import type { ClaimStatus } from '../claims/claim-presentation.ts';
import './task-status-disc.css';

export type StatusDiscKind = ClaimStatus | 'planned';

// A literal size, not a spacing step: menus tighten their spacing scale, and
// a status glyph should not shrink just because the row around it did.
const glyphSize = 'size-[15px]';

/**
 * A claim's status icon: a dashed ring while it waits, a ring that fills
 * clockwise while it runs, a check or a cross when it lands. A change keeps
 * whatever the two statuses share, so a ring that stays never redraws: the
 * pie grows on, or the old mark shrinks out as the new one draws in. The
 * status it mounts with is drawn still, so lists don't animate on load.
 */
export function TaskStatusDisc({
    className,
    status,
}: {
    className?: string;
    status: StatusDiscKind;
}) {
    const [shown, setShown] = React.useState<{
        current: StatusDiscKind;
        previous: StatusDiscKind | null;
    }>({ current: status, previous: null });

    if (shown.current !== status) {
        setShown({ current: status, previous: shown.current });
    }

    const change = statusChange(shown.previous, status);

    return (
        <svg
            aria-hidden="true"
            className={cn('task-status-disc', glyphSize, 'shrink-0', 'text-muted', className)}
            data-mark={statusMarks[status].kind}
            data-ring-draws={change?.ringExits ? '' : undefined}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
            viewBox="0 0 16 16"
        >
            {change?.ringExits ? (
                <ExitLayer key={`ring-exit-${change.id}`}>
                    <Ring kind={change.ringExits} />
                </ExitLayer>
            ) : null}
            {change?.markExits ? (
                <ExitLayer key={`mark-exit-${change.id}`}>
                    <Mark mark={change.markExits} />
                </ExitLayer>
            ) : null}
            <g
                className={change?.ringExits ? 'task-status-disc__enter' : undefined}
                key={change?.ringExits ? `ring-${change.id}` : `ring-${statusRings[status]}`}
            >
                <Ring kind={statusRings[status]} />
            </g>
            <g
                className={change?.markEnters ? 'task-status-disc__enter' : undefined}
                key={change?.markEnters ? `mark-${change.id}` : `mark-${statusMarks[status].kind}`}
                style={
                    change?.pieFrom === undefined
                        ? undefined
                        : ({ '--task-status-pie-from': change.pieFrom } as React.CSSProperties)
                }
            >
                <Mark mark={statusMarks[status]} />
            </g>
        </svg>
    );
}

function statusChange(previous: StatusDiscKind | null, status: StatusDiscKind) {
    if (previous === null) {
        return null;
    }
    const mark = statusMarks[status];
    const previousMark = statusMarks[previous];
    const pieFrom =
        mark.kind === 'pie' && previousMark.kind === 'pie'
            ? previousMark.fraction + pieRevealOvershoot
            : undefined;
    const markSwaps = pieFrom === undefined && previousMark.kind !== mark.kind;
    return {
        id: `${previous}-${status}`,
        markEnters: markSwaps || pieFrom !== undefined,
        markExits: markSwaps && previousMark.kind !== 'none' ? previousMark : null,
        pieFrom,
        ringExits: statusRings[previous] === statusRings[status] ? null : statusRings[previous],
    };
}

type RingKind = 'dashed' | 'solid';

type StatusMark =
    | { kind: 'check' }
    | { kind: 'cross' }
    | { kind: 'none' }
    | { fraction: number; kind: 'pie' };

const statusRings: Record<StatusDiscKind, RingKind> = {
    closed: 'dashed',
    done: 'solid',
    in_progress: 'solid',
    in_review: 'solid',
    planned: 'solid',
    todo: 'dashed',
};

const statusMarks: Record<StatusDiscKind, StatusMark> = {
    closed: { kind: 'cross' },
    done: { kind: 'check' },
    in_progress: { fraction: 0.5, kind: 'pie' },
    in_review: { fraction: 0.75, kind: 'pie' },
    planned: { kind: 'none' },
    todo: { kind: 'none' },
};

const strokeWidth = 1.25;
const ringRadius = 6.25;
const dashCount = 8;
const dashHalfAngle = 1.05 / ringRadius;
const pieRadius = 4;
const pieRevealOvershoot = 0.05;
const crossHalf = 2.475;
const firstDash = 5;

const ringPath = `M8 ${8 - ringRadius} A${ringRadius} ${ringRadius} 0 1 1 8 ${8 + ringRadius} A${ringRadius} ${ringRadius} 0 1 1 8 ${8 - ringRadius}`;

function ExitLayer({ children }: { children: React.ReactNode }) {
    const [done, setDone] = React.useState(false);
    if (done) {
        return null;
    }
    return (
        <g
            className="task-status-disc__exit"
            onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) {
                    setDone(true);
                }
            }}
        >
            {children}
        </g>
    );
}

function Ring({ kind }: { kind: RingKind }) {
    if (kind === 'solid') {
        return <path className="task-status-disc__ring" d={ringPath} pathLength={1} />;
    }
    return Array.from({ length: dashCount }, (_, index) => {
        const center = (index / dashCount) * 2 * Math.PI;
        return (
            <path
                className="task-status-disc__dash"
                d={arcPath(center - dashHalfAngle, center + dashHalfAngle)}
                key={index}
                pathLength={1}
                style={
                    {
                        '--task-status-order': (index - firstDash + dashCount) % dashCount,
                    } as React.CSSProperties
                }
            />
        );
    });
}

function Mark({ mark }: { mark: StatusMark }) {
    switch (mark.kind) {
        case 'check':
            return (
                <path
                    className="task-status-disc__check"
                    d="M5.6 8.2L7.2 9.75L10.4 6.4"
                    pathLength={1}
                />
            );
        case 'cross':
            return (
                <>
                    <CrossBar turn="clockwise" />
                    <CrossBar turn="counter" />
                </>
            );
        case 'pie':
            return <PieFill fraction={mark.fraction} />;
        case 'none':
            return null;
    }
}

function PieFill({ fraction }: { fraction: number }) {
    const maskId = React.useId();
    const end = fraction * 2 * Math.PI;
    const endX = (8 + pieRadius * Math.sin(end)).toFixed(3);
    const endY = (8 - pieRadius * Math.cos(end)).toFixed(3);
    return (
        <>
            <mask id={maskId}>
                <circle
                    className="task-status-disc__pie"
                    cx="8"
                    cy="8"
                    pathLength={1}
                    r={pieRadius * 0.75}
                    stroke="white"
                    strokeDasharray={`${fraction + pieRevealOvershoot} 1`}
                    strokeLinecap="butt"
                    strokeWidth={pieRadius * 1.5}
                    transform="rotate(-90 8 8)"
                />
            </mask>
            <path
                d={`M8 8L8 ${8 - pieRadius}A${pieRadius} ${pieRadius} 0 ${fraction > 0.5 ? 1 : 0} 1 ${endX} ${endY}Z`}
                fill="currentColor"
                mask={`url(#${maskId})`}
                stroke="none"
            />
        </>
    );
}

function CrossBar({ turn }: { turn: 'clockwise' | 'counter' }) {
    return (
        <path
            className={`task-status-disc__cross task-status-disc__cross--${turn}`}
            d={`M${8 - crossHalf} 8L${8 + crossHalf} 8`}
            pathLength={1}
        />
    );
}

function arcPath(from: number, to: number) {
    const point = (angle: number) =>
        `${(8 + ringRadius * Math.sin(angle)).toFixed(3)} ${(8 - ringRadius * Math.cos(angle)).toFixed(3)}`;
    return `M${point(from)} A${ringRadius} ${ringRadius} 0 0 1 ${point(to)}`;
}
