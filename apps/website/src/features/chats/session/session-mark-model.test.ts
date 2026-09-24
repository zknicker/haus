import { expect, test } from 'bun:test';
import {
    deriveSessionMarks,
    formatSessionDuration,
    sessionRotationHoverFacts,
    sessionRotationReasonLabel,
} from './session-mark-model.ts';

test('marks the Agent message whose session differs from that Agent’s previous one', () => {
    const marks = deriveSessionMarks([
        agent('msg_1', 'agt_blippy', 4),
        agent('msg_2', 'agt_blippy', 4),
        agent('msg_3', 'agt_blippy', 5),
        agent('msg_4', 'agt_blippy', 5),
    ]);

    expect([...marks.keys()]).toEqual(['msg_3']);
    expect(marks.get('msg_3')).toEqual({ agentId: 'agt_blippy', generation: 5 });
});

test('human messages in between are not the Agent’s previous message', () => {
    const marks = deriveSessionMarks([
        agent('msg_1', 'agt_blippy', 4),
        human('msg_2'),
        human('msg_3'),
        agent('msg_4', 'agt_blippy', 4),
    ]);

    expect([...marks.keys()]).toEqual([]);
});

test('the first Agent message on a loaded page is never marked', () => {
    // A page boundary is not a reset, and nothing here can tell the two apart.
    expect([...deriveSessionMarks([agent('msg_1', 'agt_blippy', 9)]).keys()]).toEqual([]);
});

test('each Agent’s restarts are its own', () => {
    const marks = deriveSessionMarks([
        agent('msg_1', 'agt_blippy', 4),
        agent('msg_2', 'agt_tiny', 2),
        agent('msg_3', 'agt_blippy', 5),
        agent('msg_4', 'agt_tiny', 2),
    ]);

    expect([...marks.keys()]).toEqual(['msg_3']);
});

test('a message with no generation neither marks nor becomes a comparison point', () => {
    const marks = deriveSessionMarks([
        agent('msg_1', 'agt_blippy', null),
        agent('msg_2', 'agt_blippy', 5),
        agent('msg_3', 'agt_blippy', 6),
    ]);

    expect([...marks.keys()]).toEqual(['msg_3']);
});

test('reasons read as what happened, not as how the session ended', () => {
    expect(sessionRotationReasonLabel('configuration')).toBe('Settings changed');
    expect(sessionRotationReasonLabel('full')).toBe('Reset');
    expect(sessionRotationReasonLabel('recovery')).toBe('Recovered');
    expect(sessionRotationReasonLabel('session')).toBe('Session rotated');
});

test('durations stay coarse and drop the empty trailing unit', () => {
    expect(formatSessionDuration(30_000)).toBe('under a minute');
    expect(formatSessionDuration(12 * 60_000)).toBe('12m');
    expect(formatSessionDuration(3 * 3_600_000)).toBe('3h');
    expect(formatSessionDuration(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m');
    expect(formatSessionDuration(2 * 86_400_000)).toBe('2d');
    expect(formatSessionDuration(2 * 86_400_000 + 4 * 3_600_000)).toBe('2d 4h');
});

test('the hover facts state the moment and the session it replaced', () => {
    const now = Date.parse('2026-09-04T12:00:00.000Z');

    expect(
        sessionRotationHoverFacts(
            {
                generation: 5,
                previousDurationMs: 3 * 3_600_000,
                reason: 'configuration',
                rotatedAt: '2026-09-04T11:30:00.000Z',
            },
            now
        )
    ).toEqual(['30m ago', 'Previous session ran 3h']);
});

test('an unknown previous session is left out, not stated as zero', () => {
    const now = Date.parse('2026-09-04T12:00:00.000Z');
    const facts = sessionRotationHoverFacts(
        {
            generation: 2,
            previousDurationMs: null,
            reason: 'recovery',
            rotatedAt: '2026-09-04T11:30:00.000Z',
        },
        now
    );

    expect(facts).toEqual(['30m ago']);
});

function agent(id: string, agentId: string, sessionGeneration: number | null) {
    return { agentId, id, sessionGeneration };
}

function human(id: string) {
    return { agentId: null, id, sessionGeneration: null };
}
