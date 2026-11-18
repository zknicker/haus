import { expect, test } from 'bun:test';
import { normalizeReactionEmoji } from './reaction-emoji.ts';

const VS16 = '\uFE0F';
const HEART = '\u2764';

test('single emoji graphemes are accepted in their fully qualified spelling', () => {
    for (const emoji of ['😂', '🎉', '👍', '🙏', '✅', '🫡', '👍🏽', '🇺🇸', '👩‍💻', '🏳️‍🌈']) {
        expect(normalizeReactionEmoji(emoji)).toBe(emoji);
    }
});

test('variation selectors and whitespace normalize so text and emoji spellings group', () => {
    expect(normalizeReactionEmoji(HEART)).toBe(`${HEART}${VS16}`);
    expect(normalizeReactionEmoji(` ${HEART}${VS16} `)).toBe(`${HEART}${VS16}`);
    expect(normalizeReactionEmoji(`${HEART}\uFE0E`)).toBe(`${HEART}${VS16}`);
    // No selector before a skin tone; keycap bases take one before U+20E3.
    expect(normalizeReactionEmoji('\u261D\u{1F3FD}')).toBe('\u261D\u{1F3FD}');
    expect(normalizeReactionEmoji('\u{1F3F3}\u200D\u{1F308}')).toBe(
        `\u{1F3F3}${VS16}\u200D\u{1F308}`
    );
    expect(normalizeReactionEmoji('#\u20E3')).toBe(`#${VS16}\u20E3`);
});

test('text, several emoji, and bare digits are refused', () => {
    for (const input of ['', 'ok', 'thanks 👍', '👍👍', '😂😂', '1', '#', 'a\u20E3', ':heart:']) {
        expect(normalizeReactionEmoji(input)).toBeNull();
    }
});
