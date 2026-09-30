/** Why an Agent reaction was refused; the Agent API returns it verbatim. */
export const reactionEmojiRule =
    'A reaction must be exactly one emoji (a flag, skin tone, or combined emoji counts as one), not text.';

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
const VARIATION_SELECTOR = /[\uFE0E\uFE0F]/gu;
// Every code point an emoji sequence may carry: emoji, their components (ZWJ, keycap,
// skin tones, regional indicators, tags), and either variation selector.
const EMOJI_SEQUENCE = /^(?:\p{Emoji}|\p{Emoji_Component}|[\uFE0E\uFE0F])+$/u;
// A lone digit, `#`, or `*` is \p{Emoji} too; something pictographic must anchor it.
const EMOJI_ANCHOR = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const TEXT_DEFAULT = /^\p{Emoji}$/u;
const PRESENTATION = /^\p{Emoji_Presentation}$/u;
const MODIFIER = /^\p{Emoji_Modifier}$/u;
const KEYCAP_BASE = /^[0-9#*]$/u;
const KEYCAP = '\u20E3';

/**
 * Normalizes one emoji to its fully qualified spelling so `❤` and `❤️` group together.
 * Returns null unless the input is exactly one emoji grapheme.
 */
export function normalizeReactionEmoji(input: string): string | null {
    const trimmed = input.trim();
    const segments = [...graphemes.segment(trimmed)];
    if (segments.length !== 1 || !EMOJI_SEQUENCE.test(trimmed) || !EMOJI_ANCHOR.test(trimmed)) {
        return null;
    }
    const points = [...trimmed.replace(VARIATION_SELECTOR, '')];
    return points
        .map((point, index) =>
            needsEmojiPresentation(point, points[index + 1]) ? `${point}\uFE0F` : point
        )
        .join('');
}

// Text-default emoji such as ❤ take U+FE0F, except before a skin tone; keycap bases take it
// only before U+20E3.
function needsEmojiPresentation(point: string, next: string | undefined) {
    if (!TEXT_DEFAULT.test(point) || PRESENTATION.test(point)) {
        return false;
    }
    if (next !== undefined && MODIFIER.test(next)) {
        return false;
    }
    return KEYCAP_BASE.test(point) ? next === KEYCAP : true;
}
