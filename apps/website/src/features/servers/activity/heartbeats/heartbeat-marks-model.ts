import type { HeartbeatMark } from '@haus/api';
import { type HeartbeatOutcome, outcomeLabels } from './heartbeats-model.ts';

/**
 * How a mark is drawn. A dream is its own glyph whatever its outcome; every
 * heartbeat takes the glyph of how it ended.
 */
export type GlyphKind = HeartbeatOutcome | 'dream';

export const glyphLabels: Record<GlyphKind, string> = { ...outcomeLabels, dream: 'Dream' };

export function readGlyphKind(mark: Pick<HeartbeatMark, 'kind' | 'outcome'>): GlyphKind {
    return mark.kind === 'nightly' ? 'dream' : mark.outcome;
}
