import { expect, test } from 'bun:test';
import {
    type LandingGeometry,
    threadLandingEntryId,
    threadLandingScrollTop,
} from './thread-unread-landing.tsx';

// Entries in transcript order, each with its newest reply sequence; a turn spans several.
const entries = new Map([
    ['entry_a', 2],
    ['entry_turn', 5],
    ['entry_c', 6],
]);

test('a Thread lands on the entry holding its first unread reply', () => {
    expect(threadLandingEntryId(entries, 1)).toBe('entry_a');
    expect(threadLandingEntryId(entries, 6)).toBe('entry_c');
    // Sequence 4 sits inside the turn that ends at 5.
    expect(threadLandingEntryId(entries, 4)).toBe('entry_turn');
});

test('a first unread reply no loaded entry reaches lands nowhere', () => {
    expect(threadLandingEntryId(entries, 9)).toBeNull();
    expect(threadLandingEntryId(new Map(), 1)).toBeNull();
});

// A 600px viewport at its start, a 64px top fade, and 120px under the composer.
const geometry: LandingGeometry = {
    bottomInset: 120,
    maxScrollTop: 2000,
    rowHeight: 80,
    rowTop: 0,
    scrollTop: 0,
    topFade: 64,
    viewportHeight: 600,
};

test('a reply already in view from the start stays put, anchor and all', () => {
    expect(threadLandingScrollTop({ ...geometry, rowTop: 300 })).toBeNull();
    // Only its first lines need to clear the fold.
    expect(threadLandingScrollTop({ ...geometry, rowHeight: 900, rowTop: 400 })).toBeNull();
});

test('a reply below the fold lands clear of the top fade with context above it', () => {
    // 64px fade (or peek) plus 48px of the reply before it.
    expect(threadLandingScrollTop({ ...geometry, rowTop: 1200 })).toBe(1200 - 112);
    expect(threadLandingScrollTop({ ...geometry, rowTop: 1200, topFade: 96 })).toBe(1200 - 144);
});

test('a landing near the end clamps rather than padding the Thread with empty space', () => {
    expect(threadLandingScrollTop({ ...geometry, maxScrollTop: 300, rowTop: 560 })).toBe(300);
});
