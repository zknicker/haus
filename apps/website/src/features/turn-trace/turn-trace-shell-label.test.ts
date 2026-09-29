import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatShellLabel,
    readShellCommandSummary,
    unwrapShellCommand,
} from './turn-trace-shell-label.ts';

test('a Codex zsh wrapper is unwrapped to the command it ran', () => {
    assert.equal(
        unwrapShellCommand(`/bin/zsh -lc "pwd && sed -n '1,240p' MEMORY.md"`),
        `pwd && sed -n '1,240p' MEMORY.md`
    );
    assert.equal(unwrapShellCommand(`zsh -lc 'ls -la'`), 'ls -la');
    assert.equal(unwrapShellCommand('bash -lc "echo hi"'), 'echo hi');
    assert.equal(unwrapShellCommand('sh -c "echo hi"'), 'echo hi');
});

test('an escaped quote inside a double-quoted wrapper is restored', () => {
    assert.equal(
        unwrapShellCommand('/bin/zsh -lc "haus message send --target \\"#all\\""'),
        'haus message send --target "#all"'
    );
});

test('something that is not a wrapper is left alone', () => {
    assert.equal(unwrapShellCommand('rg --files'), 'rg --files');
    // `-l` alone runs a login shell on a script file, not a command line.
    assert.equal(unwrapShellCommand('zsh -l script.sh'), 'zsh -l script.sh');
});

test('the summary is the first line without its heredoc opener', () => {
    assert.equal(
        readShellCommandSummary(
            `/bin/zsh -lc "haus message send --target \\"#all\\" <<'HAUSMSG'\nbody\nHAUSMSG"`
        ),
        'haus message send --target "#all"'
    );
    assert.equal(readShellCommandSummary('cat <<EOF\ntext\nEOF'), 'cat');
    assert.equal(readShellCommandSummary('  \n  echo   spaced   out  '), 'echo spaced out');
});

test('a long command is capped so the row stays one line', () => {
    const label = formatShellLabel(`rg ${'pattern '.repeat(30).trim()}`);

    assert.equal(label.length, 84);
    assert.ok(label.startsWith('Ran rg pattern'));
    assert.ok(label.endsWith('…'));
});

test('a haus command reads as the product verb it is', () => {
    assert.equal(
        formatShellLabel(`/bin/zsh -lc "haus message send --target \\"#all\\" <<'HAUSMSG'"`),
        'Sent a message with haus'
    );
    assert.equal(
        formatShellLabel(`/bin/zsh -lc 'haus message send --send-draft --target "#all"'`),
        'Sent a message with haus'
    );
    assert.equal(formatShellLabel(`zsh -lc 'haus message check'`), 'Checked messages with haus');
    assert.equal(formatShellLabel(`zsh -lc 'haus inbox check'`), 'Checked inbox with haus');
    assert.equal(formatShellLabel('haus task claim --number 3'), 'Claimed a task with haus');
});

test('a haus command with no verb of its own still states what ran', () => {
    assert.equal(formatShellLabel('haus skill list'), 'Ran haus skill list');
    assert.equal(formatShellLabel(`zsh -lc 'ls -la'`), 'Ran ls -la');
    assert.equal(formatShellLabel('   '), 'Ran a command');
});
