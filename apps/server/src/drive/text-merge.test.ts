import { expect, test } from 'bun:test';
import { mergeText } from './text-merge.ts';

const base = 'a\nb\nc\nd\ne\n';

test('edits to different lines merge', () => {
    expect(mergeText(base, 'a\nB\nc\nd\ne\n', 'a\nb\nc\nD\ne\n')).toEqual({
        status: 'merged',
        text: 'a\nB\nc\nD\ne\n',
    });
});

test('different edits to the same line conflict', () => {
    expect(mergeText(base, 'a\nb\nC1\nd\ne\n', 'a\nb\nC2\nd\ne\n')).toEqual({
        status: 'conflict',
    });
});

test('edits to adjacent lines conflict', () => {
    expect(mergeText(base, 'a\nB\nc\nd\ne\n', 'a\nb\nC\nd\ne\n')).toEqual({ status: 'conflict' });
    expect(mergeText(base, 'a\nb\nnew\nc\nd\ne\n', 'a\nb\nC\nd\ne\n')).toEqual({
        status: 'conflict',
    });
});

test('the same change on both sides is not a conflict', () => {
    expect(mergeText(base, 'a\nB\nc\nd\ne\n', 'a\nB\nc\nD\ne\n')).toEqual({
        status: 'merged',
        text: 'a\nB\nc\nD\ne\n',
    });
    expect(mergeText(base, 'a\nc\nd\ne\n', 'a\nc\nd\ne\n')).toEqual({
        status: 'merged',
        text: 'a\nc\nd\ne\n',
    });
});

test('insertions at both ends merge', () => {
    expect(mergeText(base, 'top\na\nb\nc\nd\ne\n', 'a\nb\nc\nd\ne\nbottom\n')).toEqual({
        status: 'merged',
        text: 'top\na\nb\nc\nd\ne\nbottom\n',
    });
});

test('a side that left the base unchanged yields the other side', () => {
    expect(mergeText(base, base, 'x\n')).toEqual({ status: 'merged', text: 'x\n' });
    expect(mergeText(base, 'y\n', base)).toEqual({ status: 'merged', text: 'y\n' });
});

test('a trailing newline is part of the last line', () => {
    expect(mergeText('a\nb\nc', 'a\nb\nc\n', 'A\nb\nc')).toEqual({
        status: 'merged',
        text: 'A\nb\nc\n',
    });
    expect(mergeText('a\nb\nc', 'a\nb\nc\n', 'a\nb\nC')).toEqual({ status: 'conflict' });
});

test('a carriage return stays part of its line', () => {
    const crlf = 'a\r\nb\r\nc\r\nd\r\ne\r\n';
    expect(mergeText(crlf, 'a\r\nB\r\nc\r\nd\r\ne\r\n', 'a\r\nb\r\nc\r\nD\r\ne\r\n')).toEqual({
        status: 'merged',
        text: 'a\r\nB\r\nc\r\nD\r\ne\r\n',
    });
    expect(mergeText(crlf, 'a\r\nb\nc\r\nd\r\ne\r\n', 'a\r\nB\r\nc\r\nd\r\ne\r\n')).toEqual({
        status: 'conflict',
    });
});

test('a change inside a run of equal lines lands at one spot on both sides', () => {
    expect(mergeText('e\ne\nb\ne\ne\ne\n', 'e\nA\ne\nb\ne\ne\n', 'e\ne\nb\ne\ne\n')).toEqual({
        status: 'merged',
        text: 'e\nA\ne\nb\ne\ne\n',
    });
    expect(mergeText('a\na\ne\n', 'a\ne\n', 'X1\na\ne\nC\n')).toEqual({ status: 'conflict' });
});

test('more than a thousand edits on each side still merge when no two edits touch', () => {
    const base = Array.from({ length: 2100 }, (_, index) => `line ${index}\n`);
    const side = (tag: string, remainder: number) =>
        base.map((line, index) => (index % 4 === remainder ? `${tag} ${index}\n` : line)).join('');
    const expected = Array.from({ length: 525 }, (_, block) => {
        const at = block * 4;
        return `head ${at}\nline ${at + 1}\nincoming ${at + 2}\nline ${at + 3}\n`;
    }).join('');
    expect(mergeText(base.join(''), side('head', 0), side('incoming', 2))).toEqual({
        status: 'merged',
        text: expected,
    });
});

test('megabyte inputs merge distant edits and conflict on wholesale rewrites', () => {
    const lines = Array.from({ length: 40_000 }, (_, index) => `line ${index} ${'x'.repeat(16)}`);
    const big = lines.join('\n');
    const edit = (at: number, value: string) =>
        lines.map((line, index) => (index === at ? value : line)).join('\n');
    const both = lines
        .map((line, index) => {
            if (index === 10) {
                return 'head edit';
            }
            return index === 39_000 ? 'incoming edit' : line;
        })
        .join('\n');
    expect(mergeText(big, edit(10, 'head edit'), edit(39_000, 'incoming edit'))).toEqual({
        status: 'merged',
        text: both,
    });
    const rewrite = (tag: string) => lines.map((line) => `${tag} ${line}`).join('\n');
    expect(mergeText(big, rewrite('head'), rewrite('incoming'))).toEqual({ status: 'conflict' });
});
