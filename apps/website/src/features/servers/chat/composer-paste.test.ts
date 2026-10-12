import { expect, test } from 'bun:test';
import { pastedFiles } from './composer-paste.ts';

const image = new File(['png'], 'image.png', { type: 'image/png' });

function clipboard(files: File[], data: Record<string, string>) {
    return {
        files: files as unknown as FileList,
        getData: (type: string) => data[type] ?? '',
        types: [...Object.keys(data), ...(files.length > 0 ? ['Files'] : [])],
    };
}

test('a screenshot or copied image attaches', () => {
    expect(pastedFiles(clipboard([image], {}))).toEqual([image]);
    expect(pastedFiles(clipboard([image], { 'text/html': '<img src="x">' }))).toEqual([image]);
});

test('files copied in Finder attach despite their filename text', () => {
    expect(pastedFiles(clipboard([image], { 'text/plain': 'image.png' }))).toEqual([image]);
});

test('rich text that carries a rendered image stays a text paste', () => {
    expect(
        pastedFiles(
            clipboard([image], { 'text/html': '<p>Quarterly</p>', 'text/plain': 'Quarterly' })
        )
    ).toEqual([]);
});

test('a plain text paste attaches nothing', () => {
    expect(pastedFiles(clipboard([], { 'text/plain': 'hello' }))).toEqual([]);
    expect(pastedFiles(null)).toEqual([]);
});
