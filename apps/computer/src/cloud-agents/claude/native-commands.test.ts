import { expect, test } from 'bun:test';
import { terminalTail } from './native-commands.ts';

test("a failed launch keeps Claude's last words readable", () => {
    const output = [
        '\u001b[?25l\u001b[2GQuick\u001b[8Gsafety\u001b[15Gcheck\r\n',
        '\u001b[1A\u001b[2K',
        '\u001b[31mError: no cloud environment is available\u001b[39m\r\n',
    ].join('');

    expect(terminalTail(output)).toBe(
        'Quick safety check\nError: no cloud environment is available'
    );
});

test('a long transcript keeps only its last lines', () => {
    const output = Array.from({ length: 50 }, (_, line) => `line ${line}`).join('\n');

    const tail = terminalTail(output).split('\n');

    expect(tail).toHaveLength(20);
    expect(tail.at(-1)).toBe('line 49');
});

test('a silent launcher says so', () => {
    expect(terminalTail('\u001b[?25h\r\n')).toBe('(no output)');
});
