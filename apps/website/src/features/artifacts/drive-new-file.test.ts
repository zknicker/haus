import { expect, test } from 'bun:test';
import { newFolderCandidate, untitledFileName } from './drive-new-file.ts';

test('a new folder name follows the path rules and refuses a name already in use', () => {
    expect(newFolderCandidate('haus', '  ', [])).toEqual({ status: 'empty' });
    expect(newFolderCandidate('haus', ' Plans ', ['specs'])).toEqual({
        path: 'haus/Plans',
        status: 'ready',
    });
    expect(newFolderCandidate('haus', 'a/b', [])).toMatchObject({ status: 'invalid' });
    expect(newFolderCandidate('haus', '..', [])).toMatchObject({ status: 'invalid' });
    expect(newFolderCandidate('haus', 'tab\there', [])).toMatchObject({ status: 'invalid' });
    expect(newFolderCandidate('haus', 'SPECS', ['specs', 'notes.md'])).toEqual({
        message: '“SPECS” already exists here.',
        status: 'invalid',
    });
    expect(newFolderCandidate('', 'top', [])).toEqual({ path: 'top', status: 'ready' });
});

test('a new file takes the first free untitled name, ignoring case', () => {
    expect(untitledFileName([])).toBe('untitled.md');
    expect(untitledFileName(['notes.md', 'Untitled.md'])).toBe('untitled-2.md');
    expect(untitledFileName(['untitled.md', 'untitled-2.md', 'untitled-4.md'])).toBe(
        'untitled-3.md'
    );
});
