import { describe, expect, test } from 'bun:test';
import { reminderEnvelope, reminderScriptLines } from './reminder-envelope.ts';

const base = {
    fireId: 'rmf_fire',
    nextFireAt: null,
    reminder: { description: null, title: 'Check the deploy' },
};

/** Every fire envelope ends with the command that answers it with provenance. */
const replyLine = 'reply with: haus message send --cause rmf_fire';

describe('reminder envelope', () => {
    test('names the reminder, the fire, and the command that answers it', () => {
        expect(reminderEnvelope(base).split('\n')).toEqual([
            '🔔 Reminder: Check the deploy',
            'fire=rmf_fire',
            replyLine,
        ]);
    });

    test('carries the description as the instruction under the short title', () => {
        expect(
            reminderEnvelope({
                ...base,
                reminder: {
                    description: 'Check advertising and flag campaigns that need bid changes',
                    title: 'Monday Advertising Review',
                },
            }).split('\n')
        ).toEqual([
            '🔔 Reminder: Monday Advertising Review',
            '  Check advertising and flag campaigns that need bid changes',
            'fire=rmf_fire',
            replyLine,
        ]);
    });

    test('says a backfilled description once when it repeats the title', () => {
        expect(
            reminderEnvelope({
                ...base,
                reminder: { description: 'Check the deploy', title: 'Check the deploy' },
            }).split('\n')
        ).toEqual(['🔔 Reminder: Check the deploy', 'fire=rmf_fire', replyLine]);
    });

    test('adds the next occurrence for a repeating reminder', () => {
        expect(
            reminderEnvelope({
                ...base,
                nextFireAt: new Date('2026-07-27T09:00:00.000Z'),
            }).split('\n')
        ).toEqual([
            '🔔 Reminder: Check the deploy',
            'fire=rmf_fire',
            '(next: 2026-07-27T09:00:00.000Z)',
            replyLine,
        ]);
    });

    test('carries indented script output instead of a Chat message', () => {
        expect(
            reminderEnvelope({
                ...base,
                script: { exitCode: 0, output: 'changed\nagain', timedOut: false },
            }).split('\n')
        ).toEqual([
            '🔔 Reminder: Check the deploy',
            'fire=rmf_fire',
            '🔔 Reminder script output:',
            '  changed',
            '  again',
            replyLine,
        ]);
    });

    test('reports a non-zero exit and a timeout distinctly', () => {
        expect(
            reminderEnvelope({
                ...base,
                script: { exitCode: 3, output: 'boom', timedOut: false },
            })
        ).toContain('🔔 Reminder script exited 3.');
        expect(
            reminderEnvelope({
                ...base,
                script: { exitCode: 0, output: '', timedOut: true },
            })
        ).toContain('🔔 Reminder script timed out.');
    });

    test('stays silent when a script succeeds with nothing to say', () => {
        expect(reminderScriptLines({ exitCode: 0, output: '   ', timedOut: false })).toBeNull();
        expect(
            reminderEnvelope({
                ...base,
                script: { exitCode: 0, output: '', timedOut: false },
            }).split('\n')
        ).toEqual(['🔔 Reminder: Check the deploy', 'fire=rmf_fire', replyLine]);
    });
});
