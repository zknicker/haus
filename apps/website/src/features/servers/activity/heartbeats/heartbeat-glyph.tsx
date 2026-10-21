import { MoonIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../../components/ui/icon.tsx';
import { cn } from '../../../../lib/utils.ts';
import type { GlyphKind } from './heartbeat-marks-model.ts';

/**
 * One outcome, drawn. Shape and fill carry it, so color is never the only cue:
 * a quiet ring, a reported dot with a soft halo, a half-filled yielded ring, a
 * slashed skipped ring, a warning ring for paused, a pulsing accent ring while
 * running, a danger ring for failed. A dream is the one larger mark: a moon on
 * a soft violet disc.
 */
export function HeartbeatGlyph({
    isFailed = false,
    kind,
}: {
    /** A failed dream keeps its disc but rings it in danger. */
    isFailed?: boolean;
    kind: GlyphKind;
}) {
    if (kind === 'dream') {
        return (
            <span
                aria-hidden
                className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-background',
                    isFailed ? 'bg-danger' : 'bg-dream'
                )}
            >
                <Icon icon={MoonIcon} size={13} strokeWidth={2.25} />
            </span>
        );
    }
    return <span aria-hidden className={cn('size-3.5 shrink-0 rounded-full', glyphClass[kind])} />;
}

const glyphClass: Record<Exclude<GlyphKind, 'dream'>, string> = {
    failed: 'border-2 border-danger bg-danger/20',
    paused: 'border-2 border-warning',
    quiet: 'border-2 border-muted/75',
    reported: 'bg-accent shadow-[0_0_0_3px_var(--accent-soft)]',
    running: 'border-2 border-accent motion-safe:animate-pulse',
    skipped:
        'relative border-2 border-muted/55 after:absolute after:inset-x-[-1px] after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:-rotate-45 after:bg-muted/55',
    yielded: 'border-2 border-muted bg-linear-to-r from-muted from-50% to-transparent to-50%',
};
