import { expect, test } from 'bun:test';
import { parseLocalComputerId, parseRepoFolderPick } from './desktop-repo-folder.ts';

test('only an absolute picked folder counts as picked', () => {
    expect(parseRepoFolderPick({ path: '/Users/ada/src/haus', status: 'picked' })).toEqual({
        path: '/Users/ada/src/haus',
        status: 'picked',
    });
    for (const reply of [
        { status: 'canceled' },
        { path: 'haus', status: 'picked' },
        { path: 42, status: 'picked' },
        null,
        undefined,
        '/Users/ada',
    ]) {
        expect(parseRepoFolderPick(reply)).toEqual({ status: 'canceled' });
    }
});

test('the local Computer id is a non-empty string or null', () => {
    expect(parseLocalComputerId('cmp_1')).toBe('cmp_1');
    expect(parseLocalComputerId('')).toBeNull();
    expect(parseLocalComputerId(null)).toBeNull();
    expect(parseLocalComputerId({ computerId: 'cmp_1' })).toBeNull();
});
