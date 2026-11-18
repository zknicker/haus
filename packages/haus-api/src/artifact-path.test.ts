import { expect, test } from 'bun:test';
import {
    artifactFolderSchema,
    artifactPathAncestors,
    artifactPathBasename,
    artifactPathIsInside,
    artifactPathKey,
    artifactPathParent,
    artifactPathSchema,
    artifactPathSegmentMaxLength,
    parseArtifactPath,
} from './artifact-path.ts';

test('accepts relative slash-separated paths and NFC-normalizes them', () => {
    expect(parseArtifactPath('starter-kit/scripts/tm_check.py')).toEqual({
        ok: true,
        path: 'starter-kit/scripts/tm_check.py',
    });
    const decomposed = 'café/notes.md';
    expect(parseArtifactPath(decomposed)).toEqual({ ok: true, path: 'café/notes.md' });
    expect(artifactPathSchema.parse('Report Q4.pdf')).toBe('Report Q4.pdf');
});

test('rejects every non-canonical shape with a typed problem', () => {
    const cases = [
        ['', 'empty'],
        ['/abs.txt', 'leading_slash'],
        ['folder/', 'trailing_slash'],
        ['a//b.txt', 'empty_segment'],
        ['./a.txt', 'dot_segment'],
        ['a/../b.txt', 'dot_segment'],
        ['a\\b.txt', 'invalid_character'],
        ['a\u0000b', 'invalid_character'],
        ['tab\there', 'invalid_character'],
        ['c1\u0085', 'invalid_character'],
        [`${'x'.repeat(artifactPathSegmentMaxLength + 1)}.txt`, 'segment_too_long'],
        [Array.from({ length: 300 }, () => 'abcd').join('/'), 'too_long'],
    ] as const;
    for (const [path, problem] of cases) {
        expect(parseArtifactPath(path)).toMatchObject({ ok: false, problem });
    }
    expect(artifactPathSchema.safeParse('/abs').success).toBe(false);
});

test('keys fold case and normalization so look-alike paths collide', () => {
    expect(artifactPathKey('Docs/Report.PDF')).toBe(artifactPathKey('docs/report.pdf'));
    expect(artifactPathKey('Café.md')).toBe(artifactPathKey('café.md'));
    expect(artifactPathKey('a/b')).not.toBe(artifactPathKey('a-b'));
});

test('path helpers split folders without touching segments', () => {
    expect(artifactPathBasename('a/b/c.md')).toBe('c.md');
    expect(artifactPathBasename('c.md')).toBe('c.md');
    expect(artifactPathParent('a/b/c.md')).toBe('a/b');
    expect(artifactPathParent('c.md')).toBe('');
    expect(artifactPathAncestors('a/b/c.md')).toEqual(['a', 'a/b']);
    expect(artifactPathAncestors('c.md')).toEqual([]);
    expect(artifactPathIsInside('Notes/x.md', 'notes')).toBe(true);
    expect(artifactPathIsInside('notes-old/x.md', 'notes')).toBe(false);
    expect(artifactPathIsInside('notes', 'notes')).toBe(false);
    expect(artifactPathIsInside('anything', '')).toBe(true);
});

test('folders accept the root as an empty string', () => {
    expect(artifactFolderSchema.parse('')).toBe('');
    expect(artifactFolderSchema.parse('starter-kit/scripts')).toBe('starter-kit/scripts');
    expect(artifactFolderSchema.safeParse('starter-kit/').success).toBe(false);
});
