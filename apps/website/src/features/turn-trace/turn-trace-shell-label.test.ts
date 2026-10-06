import assert from 'node:assert/strict';
import test from 'node:test';
import { setupCommand } from './turn-trace-claude-fixtures.ts';
import { formatShellLabel, readShellLabel, unwrapShellCommand } from './turn-trace-shell-label.ts';

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

test('a heredoc body is never read as a command', () => {
    assert.equal(
        formatShellLabel(
            `/bin/zsh -lc "haus message send --target \\"#all\\" <<'HAUSMSG'\nrm -rf /\nHAUSMSG"`
        ),
        'Sent a message with haus'
    );
    assert.equal(formatShellLabel('cat > notes.md <<EOF\nnpm test\nEOF'), 'Wrote notes.md');
    // A bit shift is not a heredoc opener.
    assert.equal(
        formatShellLabel("node -e 'console.log(1 << 3)'"),
        "Ran node -e 'console.log(1 << 3)'"
    );
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
    assert.equal(formatShellLabel('haus task claim --help'), 'Read haus help');
    assert.equal(formatShellLabel(`zsh -lc 'ls -la'`), 'Ran ls -la');
    assert.equal(formatShellLabel('   '), 'Ran a command');
});

test('P0-3: a script that claimed a task, wrote files, and ran tests reads as the work', () => {
    const label = readShellLabel(setupCommand);
    assert.equal(label.past, 'Wrote 7 files, ran npm test');
    assert.equal(label.present, 'Writing 7 files, running npm test');
    // mkdir and the line count; the haus claim, cd, and heredoc bodies are not commands.
    assert.equal(label.extraCommands, 2);
    assert.equal(label.isHausOnly, false);
    assert.equal(label.lines, 10);
});

test('P0-3: a haus call beside real commands never names the row', () => {
    assert.equal(
        formatShellLabel('haus task claim --help 2>&1 | head -5; node --version; which bun'),
        'Ran node --version'
    );
    assert.equal(
        readShellLabel('haus task claim --help; node --version; which bun').extraCommands,
        1
    );
});

test('only an all-haus script is bookkeeping, and it reads as its first real verb', () => {
    const label = readShellLabel(
        "haus message send --target dm:@zach <<'HAUSMSG'\nDone.\nHAUSMSG\nhaus task update --help"
    );
    assert.equal(label.past, 'Sent a message with haus');
    assert.equal(label.extraCommands, 1);
    assert.equal(label.isHausOnly, true);
    assert.equal(
        readShellLabel('haus task claim --target dm:@zach --message-id x 2>&1 | head -3')
            .isHausOnly,
        true
    );
    assert.equal(readShellLabel('haus message send && curl https://x.dev').isHausOnly, false);
});

test('setup like cd and echo is skipped; a test runner outranks other commands', () => {
    assert.equal(
        formatShellLabel('cd projects/tinylink && cat src/missing.ts; echo "exit=$?"'),
        'Ran cat src/missing.ts'
    );
    assert.equal(
        formatShellLabel('cd app && ls src\nbun test --filter trace\necho done'),
        'Ran bun test --filter trace'
    );
    assert.equal(formatShellLabel('cd app && export X=1'), 'Ran a script');
});

test('a one-line command reads as typed, with its own pipes and chains', () => {
    assert.equal(formatShellLabel('sleep 45 && echo done'), 'Ran sleep 45 && echo done');
    assert.equal(
        formatShellLabel('sleep 45 && echo done', 'present'),
        'Running sleep 45 && echo done'
    );
    assert.equal(
        formatShellLabel(`/bin/zsh -lc "rg -n 'x' src | head -3"`),
        "Ran rg -n 'x' src | head -3"
    );
});

test('a > inside quoted code is not a file write', () => {
    assert.equal(
        formatShellLabel("cd app && node -e 'if (a > b) console.log(1)'"),
        "Ran node -e 'if (a > b) console.log(1)'"
    );
    assert.equal(formatShellLabel('cd app && echo "x" > "out file.txt"'), 'Wrote out file.txt');
});
