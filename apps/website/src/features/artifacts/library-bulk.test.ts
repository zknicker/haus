import { describe, expect, test } from 'bun:test';
import type { ArtifactRecord } from '@haus/api';
import {
    bulkDeletePlan,
    bulkDownloadIsZip,
    bulkMovePaths,
    bulkZipSelection,
    selectionLinks,
    selectionSummary,
} from './library-bulk.ts';
import { isLibraryKeySelected, libraryItems, selectedLibraryItems } from './library-items.ts';

const folder = 'designs/KEY/candidates';
const file = (name: string, creator: string, size = 25 * 1024 ** 2): ArtifactRecord => ({
    artifact_id: `art_${name}`,
    author: { type: 'user', user_id: creator },
    content_type: 'image/png',
    created_at: '2026-10-01T00:00:00.000Z',
    creator: { type: 'user', user_id: creator },
    filename: `${name}.png`,
    image: null,
    path: `${folder}/${name}.png`,
    revision_id: `rev_${name}`,
    revision_number: 1,
    sha256: 'a'.repeat(64),
    size_bytes: size,
    stable_url: `https://haus.test/artifacts/art_${name}`,
    title: `${name}.png`,
    updated_at: '2026-10-01T00:00:00.000Z',
    version_url: `https://haus.test/artifacts/art_${name}?revision=rev_${name}`,
});
const files = [file('a', 'me'), file('b', 'ada'), file('c', 'me')];
const items = libraryItems([{ path: `${folder}/rejects` }], files, {});

describe('library selection', () => {
    test('items run folders first, then files, keyed as the collection keys them', () => {
        expect(items.map((item) => item.key)).toEqual([
            `${folder}/rejects`,
            'art_a',
            'art_b',
            'art_c',
        ]);
    });

    test('a selection resolves in visual order, drops keys that left, and Command-A is all', () => {
        const keys = new Set(['art_c', 'art_gone', 'art_a']);
        expect(selectedLibraryItems(keys, items).map((item) => item.key)).toEqual([
            'art_a',
            'art_c',
        ]);
        expect(selectedLibraryItems('all', items)).toHaveLength(4);
        expect(isLibraryKeySelected('all', 'anything')).toBeTrue();
        expect(isLibraryKeySelected(keys, 'art_b')).toBeFalse();
    });
});

describe('bulk delete', () => {
    test('only files this member may delete are sent; folders and others stay', () => {
        const plan = bulkDeletePlan(
            items,
            (record) => record.creator.type === 'user' && record.creator.user_id === 'me'
        );
        expect(plan.deletable.map((record) => record.artifact_id)).toEqual(['art_a', 'art_c']);
        expect(plan).toMatchObject({ kept: 2, total: 4 });
    });
});

describe('bulk move', () => {
    const paths = [`${folder}/a.png`, `${folder}/rejects`];

    test('moves what is not already in the destination', () => {
        expect(bulkMovePaths(paths, 'designs/KEY/print-ready')).toEqual(paths);
        expect(
            bulkMovePaths([...paths, 'designs/KEY/print-ready/x.png'], 'designs/KEY/print-ready')
        ).toEqual(paths);
    });

    test('a folder into itself, or a move to where everything already is, is a no-op', () => {
        expect(bulkMovePaths(paths, `${folder}/rejects`)).toBeNull();
        expect(bulkMovePaths(paths, `${folder}/Rejects/inner`)).toBeNull();
        expect(bulkMovePaths(paths, folder)).toBeNull();
    });

    test('the drive root is a destination', () => {
        expect(bulkMovePaths(paths, '')).toEqual(paths);
        expect(bulkMovePaths(['top.png'], '')).toBeNull();
    });
});

describe('bulk download and words', () => {
    test('a lone file downloads as itself; several items or any folder zip', () => {
        expect(bulkDownloadIsZip(items.slice(1, 2))).toBeFalse();
        expect(bulkDownloadIsZip(items.slice(1, 3))).toBeTrue();
        expect(bulkDownloadIsZip(items.slice(0, 1))).toBeTrue();
    });

    test('a zip is named relative to the open folder', () => {
        expect(bulkZipSelection(items.slice(1, 3), folder)).toEqual({
            paths: [`${folder}/a.png`, `${folder}/b.png`],
            root: folder,
        });
    });

    test('the summary counts items and adds up file sizes', () => {
        expect(selectionSummary(items.slice(1))).toBe('3 selected · 75 MB');
        expect(selectionSummary(items)).toBe('4 selected · 75 MB · 1 folder');
        expect(selectionSummary(items.slice(0, 1))).toBe('1 selected');
    });

    test('copy links lists each file link and each folder link, one per line', () => {
        expect(
            selectionLinks(items.slice(0, 2), (path) => `https://haus.test/files?folder=${path}`)
        ).toBe(
            `https://haus.test/files?folder=${folder}/rejects\nhttps://haus.test/artifacts/art_a`
        );
    });
});
