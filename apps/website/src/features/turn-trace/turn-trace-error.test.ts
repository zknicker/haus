import assert from 'node:assert/strict';
import test from 'node:test';
import { readFailure, readTraceError } from './turn-trace-error.ts';

test('P0-4: a Codex shell failure reads as its output and exit code, not JSON', () => {
    assert.deepEqual(
        readTraceError({
            exit_code: 1,
            formatted_output: 'ls: /definitely/not/here: No such file or directory\n',
        }),
        { exitCode: 1, message: 'ls: /definitely/not/here: No such file or directory' }
    );
    assert.deepEqual(readTraceError({ exit_code: 2 }), {
        exitCode: 2,
        message: 'Exited with code 2',
    });
});

test('P0-4: a Claude tool error loses its wrapper tags and Error prefix', () => {
    assert.deepEqual(
        readTraceError(
            '<tool_use_error>Error: No such tool available: Glob. Use find instead.</tool_use_error>'
        ),
        { exitCode: null, message: 'No such tool available: Glob. Use find instead.' }
    );
});

test('a thrown harness error keeps its message and drops the stack', () => {
    const error = [
        'Error: Harness session agt_1 has an unfinished turn and must be continued before accepting a new prompt.',
        '    at requirePromptableTurn (/node_modules/@ai-sdk/harness/dist/agent/index.js:3244:15)',
        '    at async stream (/node_modules/@ai-sdk/harness/dist/agent/index.js:4395:70)',
    ].join('\n');
    assert.equal(
        readTraceError(error)?.message,
        'Harness session agt_1 has an unfinished turn and must be continued before accepting a new prompt.'
    );
});

test('a normalized failure from Computer wins over the raw error', () => {
    assert.deepEqual(readFailure({ exitCode: 1, message: 'ls failed' }, { exit_code: 9 }), {
        exitCode: 1,
        message: 'ls failed',
    });
    assert.deepEqual(readTraceError({ exitCode: 3, message: 'boom' }), {
        exitCode: 3,
        message: 'boom',
    });
    assert.deepEqual(readFailure(undefined, undefined), {
        exitCode: null,
        message: 'The call failed.',
    });
    assert.equal(readTraceError(undefined), null);
    assert.equal(readTraceError('   '), null);
});
