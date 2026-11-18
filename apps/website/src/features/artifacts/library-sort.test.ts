import { expect, test } from 'bun:test';
import type { ArtifactFolderEntry } from '@haus/api';
import {
    defaultLibrarySort,
    librarySortOrder,
    nextLibrarySort,
    parseLibrarySort,
    sortLibraryFolders,
} from './library-sort.ts';

const folder = (name: string, files: number, minute: number): ArtifactFolderEntry => ({
    file_count: files,
    name,
    path: `designs/${name}`,
    updated_at: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
});

const folders = [folder('KEY-010', 1, 3), folder('KEY-002', 5, 1), folder('key-001', 3, 2)];
const names = (sorted: readonly ArtifactFolderEntry[]) => sorted.map((entry) => entry.name);

test('folder names sort naturally, ignoring case', () => {
    expect(names(sortLibraryFolders(folders, { by: 'name', direction: 'asc' }))).toEqual([
        'key-001',
        'KEY-002',
        'KEY-010',
    ]);
});

test('folders sort by newest file, by file count, and by name for a kind sort', () => {
    expect(names(sortLibraryFolders(folders, defaultLibrarySort))).toEqual([
        'KEY-010',
        'key-001',
        'KEY-002',
    ]);
    expect(names(sortLibraryFolders(folders, { by: 'size', direction: 'desc' }))).toEqual([
        'KEY-002',
        'key-001',
        'KEY-010',
    ]);
    expect(names(sortLibraryFolders(folders, { by: 'kind', direction: 'asc' }))).toEqual([
        'key-001',
        'KEY-002',
        'KEY-010',
    ]);
});

test('choosing the current key flips it; a new key starts in its own direction', () => {
    expect(nextLibrarySort(defaultLibrarySort, 'modified')).toEqual({
        by: 'modified',
        direction: 'asc',
    });
    expect(nextLibrarySort(defaultLibrarySort, 'name')).toEqual({ by: 'name', direction: 'asc' });
    expect(nextLibrarySort(defaultLibrarySort, 'size')).toEqual({ by: 'size', direction: 'desc' });
});

test('a sort maps onto the list API and survives storage as text', () => {
    expect(librarySortOrder({ by: 'modified', direction: 'desc' })).toEqual({
        direction: 'desc',
        order: 'updated',
    });
    expect(parseLibrarySort('name:asc')).toEqual({ by: 'name', direction: 'asc' });
    expect(parseLibrarySort('nonsense')).toEqual(defaultLibrarySort);
    expect(parseLibrarySort(null)).toEqual(defaultLibrarySort);
});
