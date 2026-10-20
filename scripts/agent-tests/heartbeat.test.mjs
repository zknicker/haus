import { expect, test } from 'bun:test';
import {
    inMorningWindow,
    newPreferenceLines,
    renderMemory,
    standingPreferenceLines,
    wordCount,
    zonedClock,
} from './heartbeat.mjs';
import { gradeHeartbeatEvidence, inventsLesson } from './heartbeat-grade.mjs';

test('renderMemory round-trips Standing Preferences', () => {
    const memory = renderMemory({ displayName: 'Eval', rules: ['One.', 'Two.'] });
    expect(standingPreferenceLines(memory)).toEqual(['One.', 'Two.']);
    expect(standingPreferenceLines('# no sections')).toBeNull();
});

test('newPreferenceLines reports only lines that were not there before', () => {
    expect(newPreferenceLines(['a', 'b'], ['a', 'b', 'c'])).toEqual(['c']);
    expect(newPreferenceLines(['a'], ['a'])).toEqual([]);
    expect(newPreferenceLines(null, null)).toEqual([]);
});

test('zonedClock reads the wall clock of an IANA zone', () => {
    // 2026-10-21T14:30:00Z is 09:30 in Chicago (CDT, UTC-5).
    expect(zonedClock('2026-10-21T14:30:00Z', 'America/Chicago')).toEqual({ hour: 9, minute: 30 });
    expect(zonedClock('2026-10-21T00:05:00Z', 'UTC')).toEqual({ hour: 0, minute: 5 });
});

test('the morning window runs 08:00 through 10:00 local, inclusive of 10:00 sharp', () => {
    const zone = 'America/Chicago';
    expect(inMorningWindow('2026-10-21T13:00:00Z', zone)).toBe(true); // 08:00
    expect(inMorningWindow('2026-10-21T14:59:00Z', zone)).toBe(true); // 09:59
    expect(inMorningWindow('2026-10-21T15:00:00Z', zone)).toBe(true); // 10:00
    expect(inMorningWindow('2026-10-21T15:01:00Z', zone)).toBe(false); // 10:01
    expect(inMorningWindow('2026-10-21T12:59:00Z', zone)).toBe(false); // 07:59
    // The same instants read as UTC are not a morning in Chicago.
    expect(inMorningWindow('2026-10-21T20:00:00Z', zone)).toBe(false);
});

test('wordCount counts whitespace-separated words', () => {
    expect(wordCount('  lead with the total ')).toBe(4);
    expect(wordCount(null)).toBe(0);
});

test('a lesson claim is invented unless the summary says there was none', () => {
    expect(inventsLesson('Learned that Zach likes tables.')).toBe(true);
    expect(inventsLesson('Quiet day. Nothing new to learn.')).toBe(false);
    expect(inventsLesson('Checked in on the staging logs question.')).toBe(false);
});

const learned = {
    dream: {
        summary:
            'Zach told me to lead with the total, then the breakdown. I had said got it but never saved it, so I did.',
    },
    operator: { displayName: 'Zach Knickerbocker' },
    preferencesAdded: ['Lead with the total, then the breakdown.'],
    scenario: 'heartbeat-learns-unsaved-correction',
    stamp: '20261020000000',
};

test('a specific summary naming the lesson, the teacher, and the unsaved acknowledgement passes', () => {
    const grade = gradeHeartbeatEvidence(learned);
    expect(grade.checks.filter((entry) => !entry.ok)).toEqual([]);
    expect(grade.ok).toBe(true);
});

test('a vague summary that skips the teacher fails the summary checks', () => {
    const grade = gradeHeartbeatEvidence({
        ...learned,
        dream: { summary: 'Tidied up memory and improved my preferences.' },
    });
    expect(grade.ok).toBe(false);
    const failed = grade.checks.filter((entry) => !entry.ok).map((entry) => entry.name);
    expect(failed.some((name) => name.includes('Zach'))).toBe(true);
    expect(failed.some((name) => name.includes('lesson'))).toBe(true);
});

test('a sourced or compound new rule fails the grammar check', () => {
    const grade = gradeHeartbeatEvidence({
        ...learned,
        preferencesAdded: ['Zach said (2026-10-20) to lead with the total @zach.'],
    });
    expect(grade.checks.some((entry) => entry.name.includes('terse') && !entry.ok)).toBe(true);
});

test('the quiet-day control tolerates no summary and rejects an invented lesson', () => {
    const base = { scenario: 'heartbeat-quiet-day-control', stamp: 's' };
    expect(gradeHeartbeatEvidence({ ...base, dream: { summary: null } }).ok).toBe(true);
    expect(
        gradeHeartbeatEvidence({ ...base, dream: { summary: 'Learned that Zach prefers tables.' } })
            .ok
    ).toBe(false);
});

test('a report must be short, findings first, with confidence and a next step', () => {
    const base = { scenario: 'heartbeat-surfaces-new-signal', stamp: 's' };
    const good = {
        ...base,
        reports: [
            {
                content:
                    'ORD-9001 is new: a $48,200 chargeback froze the card payout, due Friday. I am fairly confident from the ledger. Suggest Finance confirm the dispute owner.',
            },
        ],
    };
    expect(gradeHeartbeatEvidence(good).ok).toBe(true);
    const rambling = {
        ...base,
        reports: [{ content: `Checked everything. ${'filler '.repeat(120)}ORD-9001 chargeback.` }],
    };
    expect(gradeHeartbeatEvidence(rambling).ok).toBe(false);
});

test('quiet-run awareness needs the reply to own the check-in', () => {
    const base = { scenario: 'heartbeat-quiet-run-awareness', stamp: 's' };
    expect(
        gradeHeartbeatEvidence({
            ...base,
            reply: 'I did a heartbeat check-in earlier; nothing new.',
        }).ok
    ).toBe(true);
    expect(gradeHeartbeatEvidence({ ...base, reply: 'Just waiting for you!' }).ok).toBe(false);
});

test('lead dedupe passes on one holder and a leads-list read, fails on two holders', () => {
    const base = {
        firstAgentId: 'a',
        scenario: 'heartbeat-lead-dedupe',
        secondLeadCommands: ['haus lead list'],
        stamp: 's',
    };
    expect(gradeHeartbeatEvidence({ ...base, anchoredHolders: ['a'] }).ok).toBe(true);
    expect(gradeHeartbeatEvidence({ ...base, anchoredHolders: ['a', 'b'] }).ok).toBe(false);
    expect(
        gradeHeartbeatEvidence({ ...base, anchoredHolders: ['a'], secondLeadCommands: [] }).ok
    ).toBe(false);
});
