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
        'Sent a message to #all'
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

test('a haus command reads as the product action it is, never "with haus"', () => {
    assert.equal(
        formatShellLabel(`/bin/zsh -lc "haus message send --target \\"#all\\" <<'HAUSMSG'"`),
        'Sent a message to #all'
    );
    assert.equal(
        formatShellLabel(`/bin/zsh -lc 'haus message send --send-draft --target "#all"'`),
        'Sent a message to #all'
    );
    assert.equal(formatShellLabel(`zsh -lc 'haus message check'`), 'Checked messages');
    assert.equal(formatShellLabel(`zsh -lc 'haus inbox check'`), 'Checked inbox');
    assert.equal(formatShellLabel('haus task claim --number 3'), 'Claimed a task');
    assert.equal(formatShellLabel('haus task update --number 3 --status done'), 'Updated a task');
    assert.equal(formatShellLabel('haus message react --target "#all" --message-id 1a'), 'Reacted');
    assert.equal(formatShellLabel('haus reminder schedule --delay-seconds 60'), 'Set a reminder');
});

test('a sent message names where it went; a DM is "DM", never the peer', () => {
    const send = (flags: string) =>
        formatShellLabel(`haus message send ${flags} --done <<'HAUSMSG'\nHi\nHAUSMSG`);
    assert.equal(send('--target dm:@zach-knickerbocker'), 'Sent a message to DM');
    assert.equal(send("--target '#product'"), 'Sent a message to #product');
    assert.equal(send('--target=#product'), 'Sent a message to #product');
    assert.equal(send('--target dm:@zach-knickerbocker --reply-to 1a2b3c4d'), 'Replied in DM');
    assert.equal(send('--target "#product" --reply-to 1a2b3c4d'), 'Replied in #product');
    assert.equal(send('--target "#product:1a2b3c4d"'), 'Replied in thread');
    assert.equal(send('--target dm:@zach:1a2b3c4d'), 'Replied in thread');
    assert.equal(
        readShellLabel("haus message send --target dm:@zach <<'HAUSMSG'\nHi\nHAUSMSG").present,
        'Sending a message to DM'
    );
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
    assert.equal(label.past, 'Sent a message to DM');
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

test('control flow never names a row; the command it guards does', () => {
    const script =
        'cd "$PWD" && pwd | sed "s|.*/workspace|<workspace>|"\nif [ -d packages ]; then\n  find packages -type f | wc -l\nelse\n  echo absent; exit 1\nfi';
    const label = readShellLabel(script);
    assert.equal(label.past, 'Counted files in packages');
    assert.equal(label.extraCommands, 1);
    assert.equal(formatShellLabel('for f in src/*.ts; do\n  wc -l "$f"\ndone'), 'Ran wc -l "$f"');
    assert.equal(
        formatShellLabel('while read line; do echo "$line"; done < list.txt'),
        'Ran read line'
    );
});

test('a pipeline with a plainer name reads as its purpose', () => {
    assert.equal(formatShellLabel('find packages -type f | wc -l'), 'Counted files in packages');
    assert.equal(formatShellLabel('find . -name "*.ts" | wc -l'), 'Counted files');
    assert.equal(
        formatShellLabel('find packages -type f | head'),
        'Ran find packages -type f | head'
    );
});

test('a heredoc script names its language and quotes its first working line, never a bare -', () => {
    const python = readShellLabel(
        "cd projects/tinylink && python3 - <<'PY'\nimport json\n\n# check codes\nprint(len(codes))\nPY"
    );
    assert.equal(python.past, 'Ran a Python script');
    assert.equal(python.present, 'Running a Python script');
    assert.equal(python.detail, 'print(len(codes))');
    assert.equal(python.extraCommands, 0);
    assert.equal(
        readShellLabel(`/bin/zsh -lc "node <<'JS'\nconst fs = require('fs')\nfs.rmSync('x')\nJS"`)
            .past,
        'Ran a Node script'
    );
    // A script file is typed as run; only stdin reads stand in for a language.
    assert.equal(formatShellLabel('python3 build.py'), 'Ran python3 build.py');
    assert.equal(readShellLabel('python3 build.py').detail, null);
});
