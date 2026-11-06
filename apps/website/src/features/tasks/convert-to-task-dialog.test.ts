import { expect, test } from 'bun:test';
import { firstLineTitle } from './convert-to-task-dialog.tsx';

test("the title defaults to the message's first line, as plain text", () => {
    expect(firstLineTitle('\n\n**Renew** the [key](https://example.com)\nSecond line')).toBe(
        'Renew the key'
    );
});

test('a title never exceeds what a Task holds', () => {
    expect(firstLineTitle('a'.repeat(300))).toHaveLength(200);
});

test('a message with no text leaves the title for the reader', () => {
    expect(firstLineTitle('   \n ')).toBe('');
});
