import { expect, test } from 'bun:test';
import { workerTurnFixture as turn, workerFixture as work } from '../worker-fixture.ts';
import { askReport } from '../worker.test-utils.tsx';
import { workerActorId, workerTranscriptMessages } from './worker-transcript.ts';

const brief = {
    at: '2026-09-04T12:00:00.000Z',
    author: { id: 'agt_one', kind: 'agent' as const },
    kind: 'brief' as const,
    messageId: null,
    text: 'Fix the composer baseline.',
};

test('a Worker reads as Messages: the Agent brief, the Worker report, then a notice line', () => {
    const items = workerTranscriptMessages({
        chatId: 'cht_task',
        liveLine: null,
        reportMessages: new Map(),
        serverId: 'srv_one',
        work: work({
            turns: [
                turn({
                    input: [brief],
                    outcome: { kind: 'report', report: askReport },
                    startedAt: '2026-09-04T12:00:00.000Z',
                    status: 'pending_input',
                    terminalAt: '2026-09-04T12:17:00.000Z',
                }),
            ],
        }),
    });

    expect(items.map((item) => [item.message.author.kind, item.notice])).toEqual([
        ['agent', false],
        ['agent', false],
        ['agent', true],
    ]);
    expect(items[0]?.message.author).toEqual({ agentId: 'agt_one', kind: 'agent' });
    expect(items[1]?.message.author).toMatchObject({
        agentId: workerActorId('caw_one'),
        profile: { displayName: 'Worker on Cursor' },
    });
    expect(items[1]?.message.content).toContain('Does the iPad baseline move 2px on purpose?');
    expect(items[2]?.message.content).toBe('Needs you, worked for 17m');
});

test('a posted report Message is reused as the Worker’s own output, and a live line closes the thread', () => {
    const posted = {
        ...workerTranscriptMessages({
            chatId: 'cht_task',
            liveLine: null,
            reportMessages: new Map(),
            serverId: 'srv_one',
            work: work({ turns: [turn({ input: [brief] })] }),
        })[0]!.message,
        content: 'Posted report text',
        id: 'msg_report',
    };
    const items = workerTranscriptMessages({
        chatId: 'cht_task',
        liveLine: "On Zach's follow-up",
        reportMessages: new Map([['msg_report', posted]]),
        serverId: 'srv_one',
        work: work({
            turns: [
                turn({
                    outcome: { kind: 'report', report: { ...askReport, messageId: 'msg_report' } },
                    status: 'pending_input',
                }),
            ],
        }),
    });

    expect(items.map((item) => item.message.content)).toContain('Posted report text');
    expect(items.at(-1)).toMatchObject({
        message: { content: "On Zach's follow-up" },
        notice: true,
    });
});

test('a turn\u2019s steps ride its Worker message, and a live turn with steps carries the live line', () => {
    const step = {
        additions: null,
        deletions: null,
        kind: 'run' as const,
        label: 'bun test',
        output: ' 162 pass',
        state: 'running' as const,
    };
    const items = workerTranscriptMessages({
        chatId: 'cht_task',
        liveLine: 'Measuring the toolbar gap',
        reportMessages: new Map(),
        serverId: 'srv_one',
        work: work({ turns: [turn({ input: [brief], status: 'running', steps: [step] })] }),
    });

    expect(items.map((item) => [item.notice, item.message.content])).toEqual([
        [false, 'Fix the composer baseline.'],
        [false, 'Measuring the toolbar gap'],
    ]);
    expect(items[1]?.steps).toMatchObject({ live: true, steps: [step] });
});

test('a question report reads as one compact line while the card holds its questions or after an answer', () => {
    const questions = [
        { header: null, multiSelect: false, options: [], question: 'Which database?' },
        { header: null, multiSelect: false, options: [], question: 'Drop the old table?' },
    ];
    const report = {
        ...askReport,
        questions,
        text: '1. Which database?\n\n2. Drop the old table?',
    };
    const asking = turn({
        outcome: { kind: 'report', report },
        status: 'pending_input',
        turnId: 'wkt_ask',
    });
    const contents = (turns: ReturnType<typeof turn>[]) =>
        workerTranscriptMessages({
            chatId: 'cht_task',
            liveLine: null,
            reportMessages: new Map(),
            serverId: 'srv_one',
            work: work({ turns }),
        }).map((item) => item.message.content);
    const answer = {
        ...brief,
        author: { id: 'usr_zach', kind: 'user' as const },
        kind: 'follow-up' as const,
        text: '1. **Which database?** → Postgres\n2. **Drop the old table?** → (no answer)',
    };

    expect(contents([asking])).toContain('Asked 2 questions');
    expect(contents([asking]).join('\n')).not.toContain('Drop the old table?');
    expect(
        contents([turn({ input: [answer], status: 'running', turnId: 'wkt_two' }), asking])
    ).toEqual(['Asked 2 questions', 'Needs you, worked for 0s', answer.text]);
});

test('questions closed without an answer show in full, since no card holds them', () => {
    const dismissed = turn({
        outcome: {
            kind: 'report',
            report: {
                ...askReport,
                questions: [
                    { header: null, multiSelect: false, options: [], question: 'Which database?' },
                ],
                questionsClosed: {
                    at: '2026-09-04T12:10:00.000Z',
                    by: { id: 'usr_zach', kind: 'user' },
                    reason: 'dismissed',
                },
                text: 'Which database?',
            },
        },
        status: 'pending_input',
    });
    const items = workerTranscriptMessages({
        chatId: 'cht_task',
        liveLine: null,
        reportMessages: new Map(),
        serverId: 'srv_one',
        work: work({ turns: [dismissed] }),
    });

    expect(items[0]?.message.content).toContain('Which database?');
    expect(items.map((item) => item.message.content)).not.toContain('Asked a question');
});

test('a closed Worker that kept unpushed work ends on one line naming its worktree', () => {
    const kept = '/Users/ada/.haus/computer/servers/srv_one/worktrees/wkr_one/haus/haus';
    const items = workerTranscriptMessages({
        chatId: 'cht_task',
        liveLine: null,
        reportMessages: new Map(),
        serverId: 'srv_one',
        work: work({
            closedAt: '2026-09-04T13:00:00.000Z',
            keptWorktree: kept,
            turns: [turn({ input: [brief], outcome: { kind: 'report', report: askReport } })],
        }),
    });

    expect(items.at(-1)).toMatchObject({
        message: { content: `Kept unpushed work at ${kept}` },
        notice: true,
    });
    expect(
        workerTranscriptMessages({
            chatId: 'cht_task',
            liveLine: null,
            reportMessages: new Map(),
            serverId: 'srv_one',
            work: work({ turns: [turn({ input: [brief] })] }),
        }).map((item) => item.message.content)
    ).not.toContain(`Kept unpushed work at ${kept}`);
});
