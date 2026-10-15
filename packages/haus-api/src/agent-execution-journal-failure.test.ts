import { expect, test } from 'bun:test';
import { executionToolFailure, executionTurnFailure } from './agent-execution-journal-failure.ts';

test('names a failed turn by its terminal error line, not its stack', () => {
    expect(
        executionTurnFailure(
            'Error: Harness session agt_present-1 has an unfinished turn and must be continued before accepting a new prompt.\n    at requirePromptableTurn (/repo/node_modules/@ai-sdk/harness/dist/agent/index.js:3244:15)'
        )
    ).toEqual({
        message:
            'Harness session agt_present-1 has an unfinished turn and must be continued before accepting a new prompt.',
    });
    expect(executionTurnFailure(undefined)).toBeUndefined();
});

test('normalizes Codex shell failures, Claude exit lines, and Computer codes', () => {
    expect(
        executionToolFailure({
            exit_code: 1,
            formatted_output: 'ls: /definitely/not/here: No such file or directory\n',
        })
    ).toEqual({ exitCode: 1, message: 'ls: /definitely/not/here: No such file or directory' });
    expect(executionToolFailure('{"formatted_output":"","exit_code":2}')).toEqual({
        exitCode: 2,
        message: 'Exited with code 2.',
    });
    expect(executionToolFailure('Exit code 127\nsh: nope: command not found')).toEqual({
        exitCode: 127,
        message: 'sh: nope: command not found',
    });
    expect(
        executionToolFailure(
            '<tool_use_error>Error: No such tool available: Glob.</tool_use_error>'
        )
    ).toEqual({ message: 'No such tool available: Glob.' });
    expect(executionToolFailure({ code: 'missing_result' })).toEqual({
        message: 'The runtime never reported a result for this tool.',
    });
    expect(executionToolFailure({ details: [1, 2] })).toBeUndefined();
    expect(executionToolFailure(null)).toBeUndefined();
});
