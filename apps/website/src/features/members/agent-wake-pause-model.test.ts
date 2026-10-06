import { expect, test } from 'bun:test';
import {
    agentWakePauseCopy,
    failureCountPhrase,
    wakePauseBannerDescription,
    wakePauseFailureSentence,
    wakePauseRetryPhrase,
} from './agent-wake-pause-model.ts';

const now = Date.parse('2026-10-06T12:00:00.000Z');

test('the last error is named from its code, falling back to the failure kind', () => {
    expect(wakePauseFailureSentence({ code: 'model-unavailable', kind: 'configuration' })).toBe(
        "The model isn't available on this runtime."
    );
    expect(
        wakePauseFailureSentence(
            { code: 'authentication-required', kind: 'authentication' },
            'Codex'
        )
    ).toBe("Couldn't sign in to Codex.");
    expect(wakePauseFailureSentence({ code: null, kind: 'transport' })).toBe(
        'The provider was unreachable.'
    );
    expect(wakePauseFailureSentence({ code: null, kind: 'unknown' })).toBe(
        'Something went wrong running the Agent.'
    );
});

test('the retry phrase reads the next automatic try as relative time', () => {
    expect(wakePauseRetryPhrase(null, now)).toBe('Haus is trying again now…');
    expect(wakePauseRetryPhrase('2026-10-06T15:00:00.000Z', now)).toBe(
        'Haus will try once more automatically in 3 hours.'
    );
    expect(wakePauseRetryPhrase('2026-10-06T12:45:00.000Z', now)).toBe(
        'Haus will try once more automatically in 45 minutes.'
    );
    expect(wakePauseRetryPhrase('2026-10-07T12:00:00.000Z', now)).toBe(
        'Haus will try once more automatically in a day.'
    );
    expect(wakePauseRetryPhrase('2026-10-06T11:59:00.000Z', now)).toBe(
        'Haus will try once more automatically any moment now.'
    );
});

test('the hover banner line says when the retry lands and how to try now', () => {
    expect(wakePauseBannerDescription(null, now)).toBe('Retrying now…');
    expect(wakePauseBannerDescription('2026-10-06T15:00:00.000Z', now)).toBe(
        'Retrying in 3 hours. Send a message or restart this agent from its profile.'
    );
    expect(wakePauseBannerDescription('2026-10-06T13:00:00.000Z', now)).toBe(
        'Retrying in an hour. Send a message or restart this agent from its profile.'
    );
    expect(wakePauseBannerDescription('2026-10-06T11:00:00.000Z', now)).toBe(
        'Retrying soon. Send a message or restart this agent from its profile.'
    );
});

test('failure counts read as words', () => {
    expect(failureCountPhrase(1)).toBe('once');
    expect(failureCountPhrase(2)).toBe('twice');
    expect(failureCountPhrase(5)).toBe('5 times');
});

test('the profile copy names the Agent, the streak, the cause, and the way out', () => {
    const copy = agentWakePauseCopy(
        {
            desiredRuntimeId: 'claude-code',
            displayName: 'Fen',
            effectiveRuntimeId: 'claude-code',
            wakePause: {
                failureCount: 3,
                lastFailure: {
                    at: '2026-10-06T11:00:00.000Z',
                    code: 'authentication-required',
                    kind: 'authentication',
                },
                nextProbeAt: '2026-10-06T13:00:00.000Z',
                pausedAt: '2026-10-06T11:00:00.000Z',
            },
        },
        { canRestart: true, now }
    );
    expect(copy.title).toBe('Paused after repeated failures');
    expect(copy.lastError).toBe("Couldn't sign in to Claude Code.");
    expect(copy.description).toBe(
        "Fen failed 3 times in a row: couldn't sign in to Claude Code. Send a message or restart to try again now. Haus will try once more automatically in an hour."
    );
});

const pausedTwice = {
    failureCount: 2,
    lastFailure: { at: '2026-10-06T11:00:00.000Z', code: null, kind: 'timeout' as const },
    nextProbeAt: '2026-10-06T15:00:00.000Z',
    pausedAt: '2026-10-06T11:00:00.000Z',
};

test('a viewer who cannot restart is only offered a message; a running retry offers nothing', () => {
    const copy = agentWakePauseCopy(
        {
            desiredRuntimeId: 'codex',
            displayName: 'Fen',
            effectiveRuntimeId: null,
            wakePause: pausedTwice,
        },
        { canRestart: false, now }
    );
    expect(copy.description).toBe(
        'Fen failed twice in a row: the run stalled. Send a message to try again now. Haus will try once more automatically in 3 hours.'
    );
    expect(
        agentWakePauseCopy(
            {
                desiredRuntimeId: 'codex',
                displayName: 'Fen',
                effectiveRuntimeId: null,
                wakePause: { ...pausedTwice, nextProbeAt: null },
            },
            { canRestart: true, now }
        ).description
    ).toBe('Fen failed twice in a row: the run stalled. Haus is trying again now…');
});
