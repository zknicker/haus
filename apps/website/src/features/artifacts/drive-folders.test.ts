import { expect, test } from 'bun:test';
import type { ArtifactMetadata } from '@haus/api';
import {
    artifactFolderCrumbs,
    artifactFolderPreviews,
    artifactFolderTone,
    artifactFolderWithin,
    artifactMoveTarget,
    middleTruncatedName,
} from './drive-folders.ts';

const file = (id: string, path: string) => ({ artifact_id: id, path }) as ArtifactMetadata;

test('Move to… keeps the name and refuses a no-op or a folder into itself', () => {
    expect(artifactMoveTarget('a/notes.md', '')).toBe('notes.md');
    expect(artifactMoveTarget('notes.md', 'a/b')).toBe('a/b/notes.md');
    expect(artifactMoveTarget('a/notes.md', 'A')).toBeNull();
    expect(artifactMoveTarget('a/b', 'a/b')).toBeNull();
    expect(artifactMoveTarget('a/b', 'a/b/c')).toBeNull();
    expect(artifactMoveTarget('a/b', 'a/bc')).toBe('a/bc/b');
});

test('a folder path becomes a navigable trail, outermost first; the root has none', () => {
    expect(artifactFolderCrumbs('')).toEqual([]);
    expect(artifactFolderCrumbs('starter-kit/scripts')).toEqual([
        { label: 'starter-kit', path: 'starter-kit' },
        { label: 'scripts', path: 'starter-kit/scripts' },
    ]);
});

test('a folder’s tint comes from its own path, so siblings never reshuffle it', () => {
    const before = ['docs', 'scripts'].map(artifactFolderTone);
    // A new sibling (sorting first) used to deal every tint over again.
    expect(['docs', 'scripts'].map(artifactFolderTone)).toEqual(before);
    expect(artifactFolderTone('Docs')).toBe(artifactFolderTone('docs'));
    const tones = new Set(
        Array.from({ length: 40 }, (_, index) => artifactFolderTone(`KEY-${index}`))
    );
    expect(tones.has('neutral')).toBe(false);
    expect(tones.size).toBeGreaterThan(3);
});

test('each child folder peeks its newest files, at most three, from one recursive read', () => {
    const previews = artifactFolderPreviews(
        [{ path: 'kit' }, { path: 'Docs' }],
        [
            file('a', 'kit/scripts/a.py'),
            file('b', 'docs/b.md'),
            file('root', 'readme.md'),
            file('c', 'kit/c.txt'),
            file('d', 'kit/d.txt'),
            file('e', 'kit/e.txt'),
            file('kitten', 'kitten/x.png'),
        ]
    );
    expect(previews.get('kit')?.map((item) => item.artifact_id)).toEqual(['a', 'c', 'd']);
    expect(previews.get('Docs')?.map((item) => item.artifact_id)).toEqual(['b']);
});

test('a search hit names its folder relative to the folder being searched', () => {
    expect(artifactFolderWithin('kit/scripts/a.py', 'kit')).toBe('scripts');
    expect(artifactFolderWithin('kit/a.py', 'kit')).toBe('');
    expect(artifactFolderWithin('kit/scripts/a.py', '')).toBe('kit/scripts');
    expect(artifactFolderWithin('a.py', '')).toBe('');
});

test('a long folder name is cut in the middle so its distinguishing tail survives', () => {
    expect(middleTruncatedName('KEY-100-cat-dads-design-02')).toBe('KEY-100-ca…design-02');
    expect(middleTruncatedName('designs')).toBe('designs');
});
