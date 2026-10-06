import { expect, test } from 'bun:test';
import { agentExecutionJournalSchema } from './agent-execution-journal.ts';
import { agentTurnSchema, agentTurnTriggerSchema } from './agent-turn.ts';

test('a turn trigger carries ids only, never message text', () => {
    expect(
        agentTurnTriggerSchema.parse({
            author: 'human',
            chatId: 'cht_one',
            kind: 'message',
            messageId: 'msg_one',
        })
    ).toMatchObject({ kind: 'message' });
    expect(agentTurnTriggerSchema.parse({ kind: 'private' })).toEqual({ kind: 'private' });
    expect(
        agentTurnTriggerSchema.safeParse({
            chatId: 'cht_one',
            content: 'set up tinylink',
            kind: 'reminder',
        }).success
    ).toBe(false);
    expect(agentTurnTriggerSchema.safeParse({ chatId: 'cht_one', kind: 'private' }).success).toBe(
        false
    );
});

test('an absent trigger is explicit null on the turn record', () => {
    const turn = {
        activity: { operations: [] },
        agentId: 'agt_one',
        endedAt: '2026-10-06T17:41:50.000Z',
        failureKind: null,
        messageCount: 0,
        outputProduced: false,
        runId: 'run_one',
        startedAt: '2026-10-06T17:40:26.000Z',
        status: 'completed',
        summary: null,
    };
    expect(agentTurnSchema.safeParse(turn).success).toBe(false);
    expect(agentTurnSchema.parse({ ...turn, trigger: null }).trigger).toBeNull();
});

test('a served journal pairs raw errors with a normalized failure', () => {
    const journal = agentExecutionJournalSchema.parse({
        failure: { message: 'Harness session has an unfinished turn.' },
        runId: 'run_one',
        startedAt: '2026-10-06T17:40:26.000Z',
        status: 'failed',
        tools: [
            {
                error: { exit_code: 1, formatted_output: 'ls: nope' },
                failure: { exitCode: 1, message: 'ls: nope' },
                startedAt: '2026-10-06T17:40:27.000Z',
                status: 'failed',
                toolCallId: 'call_one',
                toolName: 'bash',
            },
        ],
    });
    expect(journal.tools[0]?.failure).toEqual({ exitCode: 1, message: 'ls: nope' });
    expect(
        agentExecutionJournalSchema.safeParse({ ...journal, failure: { message: '' } }).success
    ).toBe(false);
});
