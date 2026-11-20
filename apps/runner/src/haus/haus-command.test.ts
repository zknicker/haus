import { describe, expect, test } from 'bun:test';
import { routeBashCommand } from './haus-command.ts';

describe('routeBashCommand', () => {
    test.each([
        ['haus message check', ['message', 'check'], null],
        [
            `haus message send --target '#all' "it's \\"here\\"" plain\\ word`,
            ['message', 'send', '--target', '#all', `it's "here"`, 'plain word'],
            null,
        ],
        [
            "haus message send --target '#all' <<'EOF'\nPrice is $5 and `x`\nEOF",
            ['message', 'send', '--target', '#all'],
            'Price is $5 and `x`\n',
        ],
        [
            'haus message send <<EOF\nline one\nline two\nEOF',
            ['message', 'send'],
            'line one\nline two\n',
        ],
        ["haus message send <<< 'hi there'", ['message', 'send'], 'hi there\n'],
        ['haus', [], null],
    ])('runs a lone haus command on the runner: %j', async (command, argv, stdin) => {
        expect(await routeBashCommand(command)).toEqual({ argv, kind: 'haus', stdin });
    });

    test.each([
        'haus message check | head -5',
        'haus message check; ls',
        'echo "$(haus message check)"',
        'haus message send "$(cat notes.md)"',
        'haus message send "$MESSAGE"',
        'haus attachment upload --path *.png',
        'haus attachment upload --path ~/chart.png',
        'haus message check > inbox.txt',
        'haus message check 2>&1',
        'cd project && haus message check',
        'haus message send <<EOF\nCost: $PRICE\nEOF',
        'FOO=1 haus message check',
        "bash -lc 'haus message check'",
        'env haus message check',
        '/usr/local/bin/haus message check',
    ])('refuses a composed haus command: %j', async (command) => {
        expect(await routeBashCommand(command)).toEqual({ kind: 'haus-not-alone' });
    });

    test.each([
        'ls -la ~/haus',
        'grep -rn haus src | head',
        'git status && bun test',
        'cat <<EOF\nhaus message check\nEOF',
        'if [ -f x',
    ])('sends a command without haus to the machine: %j', async (command) => {
        expect(await routeBashCommand(command)).toEqual({ kind: 'machine' });
    });
});
