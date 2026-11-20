import { expect, test } from 'bun:test';
import { pinnedBehindHead } from './artifact-pinned-revision.ts';

test('a pinned revision older than the head offers the latest', () => {
    expect(pinnedBehindHead('rev_1', 'rev_2')).toBe(true);
});

test('a pinned revision that is the head offers nothing', () => {
    expect(pinnedBehindHead('rev_2', 'rev_2')).toBe(false);
});

test('an unpinned view, or a head still loading, offers nothing', () => {
    expect(pinnedBehindHead(undefined, 'rev_2')).toBe(false);
    expect(pinnedBehindHead('rev_1', undefined)).toBe(false);
});
