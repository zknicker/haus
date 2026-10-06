import assert from 'node:assert/strict';
import test from 'node:test';
import { readHausMessage } from './turn-trace-haus-command.ts';
import { unwrapShellCommand } from './turn-trace-shell-label.ts';

const read = (command: string) => readHausMessage(unwrapShellCommand(command));

test('a heredoc message reads as its body, whatever quotes its delimiter', () => {
    for (const opener of ["<<'HAUSMSG'", '<<"HAUSMSG"', '<<HAUSMSG', "<< 'HAUSMSG'"]) {
        assert.equal(
            read(`haus message send --target "#all" ${opener}\nLine one.\n\nLine "two".\nHAUSMSG`)
                ?.body,
            'Line one.\n\nLine "two".',
            opener
        );
    }
    assert.equal(
        read("haus message send --target '#all' <<-HAUSMSG\n\tIndented.\n\tHAUSMSG")?.body,
        'Indented.'
    );
});

test('a message survives the runtime shell wrapper', () => {
    assert.deepEqual(
        read(
            `/bin/zsh -lc "haus message send --target \\"#all:1a2b\\" --done <<'HAUSMSG'\nShipped.\nHAUSMSG"`
        ),
        { body: 'Shipped.', isReply: false, isThread: true, place: '#all' }
    );
    assert.equal(
        read(
            `bash -lc 'haus message send --target dm:@zach <<'\\''HAUSMSG'\\''\nIt'\\''s done.\nHAUSMSG'`
        )?.body,
        "It's done."
    );
});

test('a here-string, a draft, and setup before the send', () => {
    assert.equal(
        read(`haus message send --target dm:@zach <<< "Hi \\"there\\""`)?.body,
        'Hi "there"'
    );
    assert.deepEqual(read('haus message send --send-draft --target dm:@zach'), {
        body: null,
        isReply: false,
        isThread: false,
        place: 'DM',
    });
    assert.equal(
        read("cd /tmp && haus message send --target '#ops' <<'EOF'\nUp.\nEOF")?.place,
        '#ops'
    );
    assert.equal(read('haus task claim --number 3'), null);
});
