import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkUniqueResultsDir, stampFor } from './paths.mjs';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

const scratch = async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'visuals-lab-paths-'));
    roots.push(root);
    return root;
};

test('stampFor is millisecond precise and sorts the way it was created', () => {
    const earlier = stampFor(new Date('2026-09-22T23:03:52.007Z'));
    const later = stampFor(new Date('2026-09-22T23:03:52.123Z'));
    expect(earlier).toBe('2026-09-22-23-03-52-007');
    expect(later).toBe('2026-09-22-23-03-52-123');
    expect(earlier < later).toBe(true);
});

test('two stamps for the same millisecond still differ once mkUniqueResultsDir runs', async () => {
    const root = await scratch();
    const stamp = stampFor(new Date('2026-09-22T23:03:52.500Z'));

    const first = await mkUniqueResultsDir(root, stamp);
    const second = await mkUniqueResultsDir(root, stamp);
    const third = await mkUniqueResultsDir(root, stamp);

    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
    expect([first, second, third].sort()).toEqual([first, second, third]);

    const entries = await readdir(root);
    expect(entries.sort()).toEqual([stamp, `${stamp}-2`, `${stamp}-3`]);
});

test('mkUniqueResultsDir creates missing parent directories', async () => {
    const root = await scratch();
    const parent = path.join(root, 'grok', 'nested');
    const stamp = stampFor();

    const dir = await mkUniqueResultsDir(parent, stamp);

    expect(dir).toBe(path.join(parent, stamp));
    const entries = await readdir(parent);
    expect(entries).toEqual([stamp]);
});
