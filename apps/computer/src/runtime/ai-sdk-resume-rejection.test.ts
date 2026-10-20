import { expect, test } from 'bun:test';
import { isPromptResumeRejection, isResumeRejection } from './resume-rejection.ts';
import { HarnessTurnFailedError } from './turn-stream.ts';

test('only evidence that stored state is unusable counts as a resume rejection', () => {
    for (const message of [
        'No conversation found with session ID: 7f3c',
        'no rollout found for thread id 0199',
        'Session not found',
        'Cannot continue from message role: assistant',
        "Lifecycle state was produced by harness 'codex' but this agent uses 'pi'.",
        'ACP lifecycle state is incompatible with the configured authentication profile.',
    ]) {
        expect(isResumeRejection(new Error(message))).toBe(true);
    }
    for (const message of [
        'fetch failed',
        'unexpected status 401 Unauthorized',
        'Rate limit reached',
        'WebSocket connection closed',
        'The Agent runtime did not finish starting within 120 seconds (startup timed out).',
    ]) {
        expect(isResumeRejection(new Error(message))).toBe(false);
    }
});

test('stream error parts are read through the failed-turn cause chain', () => {
    const failure = new HarnessTurnFailedError(null, {
        cause: { message: 'No conversation found with session ID: 7f3c' },
    });
    expect(isResumeRejection(failure)).toBe(true);
});

test('once prompted, only runtime-specific evidence counts, never tool-borne text', () => {
    expect(isPromptResumeRejection(new Error('No conversation found with session ID: 7f3c'))).toBe(
        true
    );
    expect(isPromptResumeRejection(new Error('Cannot continue from message role: assistant'))).toBe(
        true
    );
    // MCP servers answer an expired tool session with these words.
    expect(isPromptResumeRejection(new Error('Session not found'))).toBe(false);
});
