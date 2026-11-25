import { expect, test } from 'bun:test';
import { untitledFileName } from './drive-new-file.ts';

test('a new file takes the first free untitled name, ignoring case', () => {
    expect(untitledFileName([])).toBe('untitled.md');
    expect(untitledFileName(['notes.md', 'Untitled.md'])).toBe('untitled-2.md');
    expect(untitledFileName(['untitled.md', 'untitled-2.md', 'untitled-4.md'])).toBe(
        'untitled-3.md'
    );
});
