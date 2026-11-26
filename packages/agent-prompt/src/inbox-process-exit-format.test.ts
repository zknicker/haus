import { expect, test } from 'bun:test';
import { composeProcessExitInput } from './inbox-process-exit-format.ts';

const exit = {
    computerName: 'Mac mini',
    cursor: 412,
    exitCode: 1,
    exitedAt: '2026-11-26T12:00:00.000Z',
    processId: 'prc_buildbuildbuildb',
    startedAt: '2026-11-26T11:50:00.000Z',
    tail: 'error: 2 tests failed\n',
};

test('a process exit names the process, its Computer, how it ended, and its last output', () => {
    expect(composeProcessExitInput(exit)).toBe(
        [
            '[process exit · prc_buildbuildbuildb on Mac mini · exited with code 1]',
            'Last output:\nerror: 2 tests failed\n',
            'Its output ends at afterSeq 412; process_read from afterSeq 0 reads all of it.',
        ].join('\n')
    );
});

test('a process lost to a Computer restart says so, and an empty one says it printed nothing', () => {
    expect(composeProcessExitInput({ ...exit, cursor: 0, exitCode: null, tail: '' })).toBe(
        [
            '[process exit · prc_buildbuildbuildb on Mac mini · ended when its Computer restarted]',
            'It printed nothing.',
            'Its output ends at afterSeq 0; process_read from afterSeq 0 reads all of it.',
        ].join('\n')
    );
});
