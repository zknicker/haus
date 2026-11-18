import { expect, test } from 'bun:test';
import { isNoisePath, planArtifactUpload, skipUnchangedReplacements } from './upload-plan.ts';

const sources = (...paths: string[]) =>
    paths.map((relativePath) => ({ file: relativePath, relativePath }));
const paths = (uploads: readonly { path: string }[]) => uploads.map((upload) => upload.path);

test('files land in the open folder; existing paths are asked about, new ones just added', () => {
    const plan = planArtifactUpload(
        sources('scripts/a.py', 'scripts/B.py', 'readme.md'),
        'starter-kit',
        ['starter-kit/scripts/b.py', 'starter-kit/other.txt']
    );
    expect(paths(plan.additions)).toEqual(['starter-kit/scripts/a.py', 'starter-kit/readme.md']);
    // Compared by folded key, as the Server does.
    expect(paths(plan.replacements)).toEqual(['starter-kit/scripts/B.py']);
    expect(plan.rejected).toEqual([]);
});

test('operating-system noise is skipped silently, not reported', () => {
    const plan = planArtifactUpload(
        sources('kit/.DS_Store', 'kit/._a.png', '__MACOSX/kit/a.png', 'Thumbs.db', 'kit/a.png'),
        '',
        []
    );
    expect(plan.skippedNoise).toBe(4);
    expect(paths(plan.additions)).toEqual(['kit/a.png']);
    expect(isNoisePath('notes/.dsstore-guide.md')).toBe(false);
});

test('invalid paths are refused before any bytes move', () => {
    const plan = planArtifactUpload(
        sources('ok.txt', 'bad\\name.txt', `${'x'.repeat(256)}.txt`),
        '',
        []
    );
    expect(paths(plan.additions)).toEqual(['ok.txt']);
    expect(plan.rejected.map((entry) => entry.path)).toEqual([
        'bad\\name.txt',
        `${'x'.repeat(256)}.txt`,
    ]);
    expect(plan.rejected[0]?.message).toContain('backslashes');
});

test('a file cannot land where a folder is, under a file, or twice in one upload', () => {
    const plan = planArtifactUpload(
        sources('docs', 'notes/x.md', 'a.txt', 'A.TXT', 'pack', 'pack/inner.txt'),
        '',
        ['docs/guide.md', 'notes']
    );
    expect(plan.rejected).toEqual([
        { message: 'A folder with this name already exists.', path: 'docs' },
        { message: '"notes" is a file, not a folder.', path: 'notes/x.md' },
        { message: 'Another file in this upload has the same name.', path: 'A.TXT' },
        { message: '"pack" is also uploaded as a file.', path: 'pack/inner.txt' },
    ]);
    expect(paths(plan.additions)).toEqual(['a.txt', 'pack']);
});

test('replacements whose bytes already are the current revision are skipped', () => {
    const plan = planArtifactUpload(sources('a.png', 'b.png', 'c.png'), 'prints', [
        'prints/A.png',
        'prints/b.png',
    ]);
    const next = skipUnchangedReplacements(
        plan,
        new Map([
            ['prints/a.png', 'same'],
            ['prints/b.png', 'edited'],
        ]),
        new Map([
            ['prints/a.png', 'same'],
            ['prints/b.png', 'older'],
        ])
    );
    expect(paths(next.unchanged)).toEqual(['prints/a.png']);
    expect(paths(next.replacements)).toEqual(['prints/b.png']);
    expect(paths(next.additions)).toEqual(['prints/c.png']);
});
