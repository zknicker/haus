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
