import { expect, test } from 'bun:test';
import { classifyRuntimeFailure, isRetryableRuntimeFailure } from '../runtime-failure.ts';
import { fatalRuntimeSessionFailure } from './runtime-session-failure.ts';

test('a rejected-credential retry is fatal and classifies as authentication', () => {
    const failure = fatalRuntimeSessionFailure({
        category: 'access',
        severity: 'warning',
        title: 'Reconnecting... 1/5',
    });
    expect(failure?.severity).toBe('warning');
    expect(classifyRuntimeFailure(failure)).toBe('authentication');
    expect(isRetryableRuntimeFailure('authentication')).toBe(false);
});

test('transient retries and informational notices never end the turn', () => {
    for (const failure of [
        { category: 'connection', severity: 'warning', title: 'Reconnecting... 1/5' },
        { category: 'limit', severity: 'warning', title: 'Reconnecting... 2/5' },
        { category: 'service', severity: 'warning', title: 'Reconnecting... 3/5' },
        // An MCP or transport notice may quote a 401 without the model credential failing.
        {
            category: 'unknown',
            severity: 'warning',
            title: 'Falling back from WebSockets to HTTPS transport. unexpected status 401',
        },
    ] as const) {
        expect(fatalRuntimeSessionFailure(failure)).toBeNull();
    }
});

test('a terminal failure is fatal and keeps its provider kind', () => {
    const terminal = (title: string) =>
        fatalRuntimeSessionFailure({ category: 'service', severity: 'error', title });
    expect(
        classifyRuntimeFailure(
            terminal('unexpected status 401 Unauthorized: Incorrect API key provided: sk-***')
        )
    ).toBe('authentication');
    expect(classifyRuntimeFailure(terminal('unexpected status 503 Service Unavailable'))).toBe(
        'transport'
    );
});
