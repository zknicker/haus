import { cn } from '../../../../lib/utils.ts';
import { type GlyphKind, glyphLabels } from './heartbeat-marks-model.ts';

/**
 * One outcome, drawn as a badge: a thin rim ring, an inner disc a step lighter
 * than the page, and a bold rounded glyph. The states that matter (reported,
 * running, dream, paused) also carry a soft halo in their own hue. Shape carries
 * the outcome so color is never the only cue: a quiet pulse, a reported pulse
 * with a spark, a raised hand for yielded, a dashed skipped line, pause bars, a
 * broken failed pulse, a running pulse whose halo breathes, a dream crescent
 * with a star. Drawn on a 24 grid; strokes are heavy enough to hold at 16px.
 */
export function HeartbeatGlyph({
    isFailed = false,
    kind,
    size = 22,
}: {
    /** A failed dream keeps its moon but sits in danger ink with no halo. */
    isFailed?: boolean;
    kind: GlyphKind;
    /** Rendered size in px: 16 summary pip, 22 lane mark, 26 dream, 40 detail. */
    size?: number;
}) {
    const tone = isFailed ? failedDreamTone : tones[kind];
    return (
        <svg
            aria-label={glyphLabels[kind]}
            className="shrink-0 overflow-visible"
            fill="none"
            height={size}
            role="img"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.25}
            viewBox="0 0 24 24"
            width={size}
        >
            {tone.glow ? (
                <circle
                    className={cn(
                        tone.glow,
                        'blur-[2.5px]',
                        kind === 'running' && 'motion-safe:animate-pulse'
                    )}
                    cx={12}
                    cy={12}
                    r={11}
                    stroke="none"
                />
            ) : null}
            <circle className="fill-surface-secondary" cx={12} cy={12} r={9.5} stroke="none" />
            <circle className={tone.disc} cx={12} cy={12} r={9.5} stroke="none" />
            <circle
                className={tone.ink}
                cx={12}
                cy={12}
                r={11}
                strokeOpacity={0.35}
                strokeWidth={1}
            />
            <g className={tone.ink}>
                <Mark kind={kind} />
            </g>
        </svg>
    );
}

function Mark({ kind }: { kind: GlyphKind }) {
    switch (kind) {
        case 'dream':
            return (
                <>
                    <path
                        d="M14.2 5.2a7.2 7.2 0 1 0 5 10.6 5.8 5.8 0 0 1-5-10.6z"
                        fill="currentColor"
                        strokeWidth={1}
                    />
                    <path
                        d="M18 4.2c.2 1.3.9 2 2.2 2.2-1.3.2-2 .9-2.2 2.2-.2-1.3-.9-2-2.2-2.2 1.3-.2 2-.9 2.2-2.2z"
                        fill="currentColor"
                        strokeWidth={0.6}
                    />
                </>
            );
        case 'quiet':
            return <path d="M5 12.5h3l2.2-4.8 3.4 9.6 2.2-4.8H19" />;
        case 'running':
            return <path d="M4.5 12.5h3l2.3-5.2 3.4 10.4 2.3-5.2h3" />;
        case 'reported':
            return (
                <>
                    <path d="M4.5 14h3l2-4.2 3 8.4 1.8-4.2H16" />
                    <path
                        d="M17.5 3.8c.3 1.8 1.4 2.9 3.2 3.2-1.8.3-2.9 1.4-3.2 3.2-.3-1.8-1.4-2.9-3.2-3.2 1.8-.3 2.9-1.4 3.2-3.2z"
                        fill="currentColor"
                        strokeWidth={0.8}
                    />
                </>
            );
        case 'yielded':
            return (
                <>
                    <path
                        d="M9.2 11V6.8M11.9 10.5V5.6M14.6 10.5V6.2M17.2 11.5V8.4M8.4 14.4l-1.6-2.6"
                        strokeWidth={2.2}
                    />
                    <path
                        d="M8 11h10.4v3.6A4.4 4.4 0 0 1 14 19h-1.6A4.4 4.4 0 0 1 8 14.6z"
                        fill="currentColor"
                        strokeWidth={1}
                    />
                </>
            );
        case 'skipped':
            return <path d="M4.5 12h15" strokeDasharray="2.4 3.2" />;
        case 'paused':
            return <path d="M9.3 7.5v9M14.7 7.5v9" strokeWidth={3.2} />;
        case 'failed':
            return (
                <>
                    <path d="M4.5 12.5h3l2.2-4.8 2.3 9.4" />
                    <path d="M15 12.5h4.5" />
                </>
            );
        default:
            return null;
    }
}

interface Tone {
    /** The disc's tint over the inner surface. */
    readonly disc: string;
    /** The blurred halo behind the badge, for states that matter. */
    readonly glow?: string;
    /** The glyph and rim ink, set as `currentColor`. */
    readonly ink: string;
}

const failedDreamTone: Tone = { disc: 'fill-danger-soft', ink: 'text-danger' };

const tones: Record<GlyphKind, Tone> = {
    dream: { disc: 'fill-dream-soft', glow: 'fill-glow-dream', ink: 'text-dream' },
    failed: { disc: 'fill-danger-soft', ink: 'text-danger' },
    paused: { disc: 'fill-warning-soft', glow: 'fill-glow-warning', ink: 'text-warning' },
    quiet: { disc: 'fill-transparent', ink: 'text-muted' },
    reported: { disc: 'fill-accent-soft', glow: 'fill-glow-accent', ink: 'text-accent' },
    running: { disc: 'fill-accent-soft', glow: 'fill-glow-accent', ink: 'text-accent' },
    skipped: { disc: 'fill-transparent', ink: 'text-muted/60' },
    yielded: { disc: 'fill-transparent', ink: 'text-muted' },
};
