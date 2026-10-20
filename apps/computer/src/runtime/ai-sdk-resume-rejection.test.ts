import { expect, test } from 'bun:test';
import { HarnessTurnFailedError } from '../harness/turn-stream.ts';
import { harnessOpenRejection, harnessPromptRejection } from './ai-sdk-resume-rejection.ts';
import { isRuntimeResumeRejection, RuntimeResumeRejectedError } from './resume-rejected.ts';

const opened = (message: string) =>
    isRuntimeResumeRejection(harnessOpenRejection('codex', new Error(message)));

test('only harness evidence that stored state is unusable becomes the typed rejection', () => {
    for (const message of [
        'No conversation found with session ID: 7f3c',
        'no rollout found for thread id 0199',
        'Session not found',
        "Lifecycle state was produced by harness 'codex' but this agent uses 'claude-code'.",
        'ACP lifecycle state is incompatible with the configured authentication profile.',
    ]) {
        expect(opened(message)).toBe(true);
    }
    for (const message of [
        'fetch failed',
        'unexpected status 401 Unauthorized',
        'Rate limit reached',
        'WebSocket connection closed',
        'The Agent runtime did not finish starting within 120 seconds (startup timed out).',
    ]) {
        expect(opened(message)).toBe(false);
    }
});

test('stream error parts are read through the failed-turn cause chain', () => {
    const failure = new HarnessTurnFailedError(null, {
        cause: { message: 'No conversation found with session ID: 7f3c' },
    });
    const typed = harnessOpenRejection('claude-code', failure);
    expect(typed).toBeInstanceOf(RuntimeResumeRejectedError);
    expect(isRuntimeResumeRejection(new HarnessTurnFailedError(null, { cause: typed }))).toBe(true);
});

test('once prompted, only runtime-specific evidence counts, never tool-borne text', () => {
    const prompted = (message: string) =>
        isRuntimeResumeRejection(harnessPromptRejection('claude-code', new Error(message)));
    expect(prompted('No conversation found with session ID: 7f3c')).toBe(true);
    // MCP servers answer an expired tool session with these words.
    expect(prompted('Session not found')).toBe(false);
});
