import { expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
    evidenceDirectory,
    inMorningWindow,
    journalTrace,
    newPreferenceLines,
    renderMemory,
    runReasoning,
    standingPreferenceLines,
    wordCount,
    zonedClock,
} from './heartbeat.mjs';
import { gradeHeartbeatEvidence, inventsLesson } from './heartbeat-grade.mjs';
import { leadDedupeOutcome } from './heartbeat-lead-dedupe.mjs';
import { morningPostReadsAlone } from './heartbeat-morning.mjs';
import { opensWithHeadsUp } from './heartbeat-standing.mjs';

test('a morning post reads alone only with a heads-up, the finding, why now, and no reminder', () => {
    const facts = { finding: /ORD-7002|certificate/iu, whyNow: /expir\w*|Tuesday/iu };
    expect(
        morningPostReadsAlone(
            'Heads-up: the payment gateway certificate (ORD-7002) expires Tuesday and nobody owns the renewal.',
            facts
        )
    ).toEqual([]);
    expect(morningPostReadsAlone('Renewing ORD-7002 now; it expires Tuesday.', facts)).toEqual([
        'opens with a heads-up line',
    ]);
    expect(morningPostReadsAlone('Heads-up: ORD-7002 still needs an owner.', facts)).toEqual([
        'says why it matters now',
    ]);
    expect(morningPostReadsAlone('Reminder: ORD-7002 certificate expires Tuesday.', facts)).toEqual(
        ['opens with a heads-up line', 'does not lean on the reminder']
    );
});

test('opensWithHeadsUp reads only the first line, and a bare action is not a heads-up', () => {
    expect(opensWithHeadsUp('Heads-up: ORD-7001 has waited since Monday.')).toBe(true);
    expect(opensWithHeadsUp('\nFlagging ORD-7001, still unreviewed.\nDetails below.')).toBe(true);
    expect(opensWithHeadsUp('Sweeping the ws updates now.')).toBe(false);
    expect(opensWithHeadsUp('Sweeping now.\nHeads-up: ws fix pending.')).toBe(false);
    expect(opensWithHeadsUp('')).toBe(false);
});

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

test('lead dedupe grades outcome: one answer, one reporter, facts present', () => {
    const base = {
        answerPosts: [{ content: 'Annual discount is 20% on Pro and Team.' }],
        answered: true,
        // Both Agents may glance at a source they own; only one may send the finding up.
        callers: ['first', 'second'],
        reporters: ['agt_first'],
        scenario: 'heartbeat-lead-dedupe',
        stamp: 's',
    };
    expect(gradeHeartbeatEvidence(base).ok).toBe(true);
    expect(gradeHeartbeatEvidence({ ...base, reporters: ['agt_first', 'agt_second'] }).ok).toBe(
        false
    );
    expect(gradeHeartbeatEvidence({ ...base, reporters: [] }).ok).toBe(false);
    expect(gradeHeartbeatEvidence({ ...base, answerPosts: [{}, {}] }).ok).toBe(false);
    expect(gradeHeartbeatEvidence({ ...base, answerPosts: [], answered: false }).ok).toBe(false);
});

test('lead dedupe outcome reads facts from posts and callers from MCP calls', () => {
    const posts = ['On it.', 'Yes: 20% on Pro and Team.'];
    const calls = [
        { caller: 'first', key: null, tool: 'list_recent_audit_records' },
        { caller: 'second', key: 'DOC-Q3-PRICING', tool: 'lookup_audit_record' },
    ];
    const outcome = leadDedupeOutcome({ calls, posts });
    expect(outcome.answered).toBe(true);
    expect(outcome.answerPosts).toHaveLength(1);
    expect(outcome.callers).toEqual(['second']);
    expect(leadDedupeOutcome({ calls: [], posts: ['Not sure.'] }).answered).toBe(false);
});

test('lead dedupe replays saved live evidence: answers found, scan-only calls are not research', async () => {
    const directory = path.join(evidenceDirectory);
    const files = existsSync(directory)
        ? readdirSync(directory).filter((file) => file.endsWith('-heartbeat-lead-dedupe.json'))
        : [];
    // Evidence is local-only; with none saved, the inline shape below still replays.
    const saved = files.map((file) => JSON.parse(readFileSync(path.join(directory, file), 'utf8')));
    saved.push({
        mcpCalls: [{ caller: 'first', key: null, tool: 'list_recent_audit_records' }],
        posts: {
            channel: [
                'Yes. The Q3 pricing page notes say Pro and Team receive a 20% annual discount; Starter has no annual discount.',
            ],
        },
    });
    for (const evidence of saved.filter((entry) => Array.isArray(entry.posts?.channel))) {
        const outcome = leadDedupeOutcome({
            calls: evidence.mcpCalls ?? [],
            posts: evidence.posts.channel,
        });
        // Posts are plain strings; the earlier object-shaped predicate dropped them all.
        const factual = evidence.posts.channel.filter((post) =>
            /20\s*%|\bPro\b|\bTeam\b/u.test(post)
        );
        expect(outcome.answerPosts).toHaveLength(factual.length);
        // List/scan calls alone never count as research on the pricing record.
        if ((evidence.mcpCalls ?? []).every((call) => call.tool !== 'lookup_audit_record')) {
            expect(outcome.callers).toEqual([]);
        }
    }
});

test('journalTrace orders reasoning and tool calls, and marks failed calls', () => {
    const trace = journalTrace({
        reasoning: [{ startedAt: '2026-10-24T02:00:02Z', text: ' Read the recipe first. ' }],
        tools: [
            {
                input: { command: 'haus reminder schedule' },
                failure: { exitCode: 1, message: 'invalid --fire-at' },
                startedAt: '2026-10-24T02:00:05Z',
                status: 'failed',
            },
            {
                input: { command: 'haus manual get' },
                output: 'recipe body',
                startedAt: '2026-10-24T02:00:01Z',
                status: 'completed',
            },
        ],
    });
    expect(trace).toEqual([
        '$ {"command":"haus manual get"}',
        '> recipe body',
        'Read the recipe first.',
        '$ {"command":"haus reminder schedule"}',
        '! failed: exit 1: invalid --fire-at',
    ]);
});

test('runReasoning retries a missing journal and notes one that never arrives', async () => {
    const results = [
        { status: 'missing' },
        { journal: { reasoning: [], tools: [] }, status: 'available' },
    ];
    const kit = { serverId: 'srv', trpc: async () => results.shift() ?? { status: 'missing' } };
    expect(await runReasoning(kit, 'agt', { runId: 'run_1' }, { delayMs: 0 })).toEqual([]);
    expect(await runReasoning(kit, 'agt', { runId: 'run_2' }, { attempts: 2, delayMs: 0 })).toEqual(
        ['(journal for run run_2 missing)']
    );
});
