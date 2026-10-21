import { HeartbeatGlyph } from './heartbeat-glyph.tsx';
import { type GlyphKind, glyphLabels } from './heartbeat-marks-model.ts';

/** What each glyph on the day means: only the kinds present, dream included. */
export function HeartbeatLegend({ kinds }: { kinds: readonly GlyphKind[] }) {
    if (kinds.length === 0) {
        return null;
    }
    return (
        <ul
            aria-label="Legend"
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-(--trace-pad) py-1.5 text-muted text-xs"
        >
            {kinds.map((kind) => (
                <li className="flex items-center gap-1.5" key={kind}>
                    <HeartbeatGlyph kind={kind} />
                    {glyphLabels[kind]}
                </li>
            ))}
        </ul>
    );
}
