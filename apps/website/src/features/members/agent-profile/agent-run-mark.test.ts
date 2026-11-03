import { expect, test } from 'bun:test';
import type { AgentTurnTrigger } from '@haus/api';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { readRunOutcomeLine } from './agent-run-mark.ts';
import { formatTurnOutcome } from './agent-turn-outcome.ts';
import { resolveTurnRowTitle } from './agent-turn-row-model.ts';

type SettledTurn = Extract<AgentActivityTurn, { kind: 'settled' }>;

const chats = new Map([['cht_product', { kind: 'channel' as const, name: 'product' }]]);
const dream = { added: 0, kind: 'dream', learned: null, removed: 0 } as const;
const quietHeartbeat = { kind: 'heartbeat', report: null, yielded: false } as const;

test('a heartbeat is a quiet background row: Checking in live, Checked in once settled', () => {
    expect(resolveTurnRowTitle(quietHeartbeat, chats, true)).toMatchObject({
        place: null,
        quiet: true,
        run: { badge: 'Heartbeat', outcome: null },
        text: 'Checking in',
    });
    expect(resolveTurnRowTitle(quietHeartbeat, chats)).toMatchObject({
        place: null,
        quiet: true,
        run: { badge: 'Heartbeat', outcome: 'Nothing to report' },
        text: 'Checked in',
    });
    // A report reaching the main session is a normal turn with the badge and no line of its own.
    expect(
        resolveTurnRowTitle({ heartbeatRunId: 'run_hb', kind: 'heartbeat_report' }, chats)
    ).toEqual({
        kind: 'text',
        place: null,
        run: { badge: 'Heartbeat', outcome: null, paused: false },
        text: 'Heartbeat report',
    });
    expect(resolveTurnRowTitle(dream, chats, true)).toMatchObject({ text: 'Dreaming' });
});

test('a heartbeat that sent a report is not muted, and its line says what became of it', () => {
    const report = {
        posted: true,
        postedChatId: 'cht_product',
        text: '**Sales** are up 20%. Labels are due.\n\nMore.',
    };
    expect(resolveTurnRowTitle({ kind: 'heartbeat', report, yielded: false }, chats)).toMatchObject(
        {
            quiet: false,
            run: { outcome: 'Sales are up 20%. · Posted in #product' },
            text: 'Checked in',
        }
    );
    const read = { ...report, posted: false, postedChatId: null };
    expect(
        resolveTurnRowTitle({ kind: 'heartbeat', report: read, yielded: false }, chats)
    ).toMatchObject({
        run: { outcome: 'Sales are up 20%. · Read, not posted' },
    });
    // Posted somewhere the viewer cannot see: still posted, place unnamed.
    const hidden = { ...report, postedChatId: null };
    expect(
        resolveTurnRowTitle({ kind: 'heartbeat', report: hidden, yielded: false }, chats)
    ).toMatchObject({
        run: { outcome: 'Sales are up 20%. · Posted' },
    });
    expect(
        formatTurnOutcome({
            ...settled(),
            trigger: { kind: 'heartbeat', report, yielded: false },
        })
    ).toBe('Reported');
});

test('a dream line is what it learned, else the memory it tidied, else no changes', () => {
    const outcome = (trigger: AgentTurnTrigger) => {
        const title = resolveTurnRowTitle(trigger, chats);
        return title.kind === 'text' ? title.run?.outcome : undefined;
    };
    expect(resolveTurnRowTitle(dream, chats)).toMatchObject({ place: null, text: 'Dreamed' });
    expect(outcome({ ...dream, learned: '**Prefers** terse replies.' })).toBe(
        'Prefers terse replies.'
    );
    expect(outcome({ ...dream, added: 3, removed: 1 })).toBe('Tidied memory (+3 −1)');
    expect(outcome(dream)).toBe('No memory changes');
});

test('a run line is the failure text when it failed, and pausing when the Server stopped it', () => {
    const title = resolveTurnRowTitle(quietHeartbeat, chats);
    const run = title.kind === 'text' ? title.run : undefined;
    if (!run) {
        throw new Error('A heartbeat carries a run mark.');
    }
    expect(readRunOutcomeLine(run, settled())).toBe('Nothing to report');
    expect(readRunOutcomeLine(run, settled({ failureKind: 'timeout', status: 'failed' }))).toBe(
        'Timed out'
    );
    expect(readRunOutcomeLine({ ...run, paused: true }, settled({ status: 'interrupted' }))).toBe(
        'Paused for a new message'
    );
});

test('a heartbeat that did nothing observable says it checked in, not that it stayed quiet', () => {
    expect(formatTurnOutcome({ ...settled(), trigger: quietHeartbeat })).toBe('Checked in');
    expect(formatTurnOutcome(settled())).toBe('Stayed quiet');
});

function settled(overrides: Partial<SettledTurn> = {}): SettledTurn {
    return {
        durationMs: 60_000,
        endedAt: '2026-10-06T12:01:00.000Z',
        events: [],
        failureKind: null,
        kind: 'settled',
        messageCount: 0,
        operationCount: 0,
        operations: [],
        outputProduced: true,
        runId: 'run_one',
        startedAt: '2026-10-06T12:00:00.000Z',
        status: 'completed',
        trigger: null,
        ...overrides,
    };
}
