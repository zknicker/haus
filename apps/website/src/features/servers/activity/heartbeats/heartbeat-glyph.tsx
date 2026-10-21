import { cn } from '../../../../lib/utils.ts';

/**
 * The small glyph at the head of a system note: a broken pulse for a run that
 * failed, a raised hand for one that yielded to a message. Plain strokes in the
 * note's ink on a 24 grid; shape carries the meaning so color is never the only cue.
 */
export function HeartbeatNoteGlyph({
    kind,
    size = 16,
}: {
    kind: 'dreamed' | 'failed' | 'yielded';
    size?: number;
}) {
    return (
        <svg
            aria-hidden="true"
            className={cn('shrink-0', ink[kind])}
            fill="none"
            height={size}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
            width={size}
        >
            {kind === 'dreamed' ? (
                <path d="M14.2 5.2a7.2 7.2 0 1 0 5 10.6 5.8 5.8 0 0 1-5-10.6z" />
            ) : null}
            {kind === 'failed' ? (
                <>
                    <path d="M3 12.5h4l2.5-6 3 11" />
                    <path d="M16 12.5h5" />
                </>
            ) : null}
            {kind === 'yielded' ? (
                <>
                    <path d="M9 11V6.5M12 10.5V5M15 10.5V6M18 11.5V8.5M8 14.5l-1.8-3" />
                    <path d="M8 11h11v3.6A4.4 4.4 0 0 1 14.6 19h-2.2A4.4 4.4 0 0 1 8 14.6z" />
                </>
            ) : null}
        </svg>
    );
}

const ink = { dreamed: 'text-dream', failed: 'text-danger', yielded: 'text-muted' } as const;
