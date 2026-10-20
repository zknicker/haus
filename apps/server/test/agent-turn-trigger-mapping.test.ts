import { expect, test } from 'bun:test';
import { AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH } from '@haus/api';
import { agentTurnTrigger } from '../src/server-agents/agent-turn-trigger.ts';
import { previewHead } from '../src/server-agents/agent-turn-trigger-previews.ts';

test('maps each inbox source to its narrow trigger kind', () => {
    const at = (source: string, workId = 'msg_one') =>
        agentTurnTrigger({ chatId: 'cht_one', source, visible: true, workId });
    expect(at('agent:wren')).toEqual({
        author: 'agent',
        chatId: 'cht_one',
        kind: 'message',
        messageId: 'msg_one',
        preview: null,
    });
    expect(at('task_assignment', 'task-assign:msg_task:3')).toEqual({
        chatId: 'cht_one',
        kind: 'task',
        messageId: 'msg_task',
        preview: null,
    });
    expect(
        agentTurnTrigger(
            { chatId: 'cht_one', source: 'human', visible: true, workId: 'msg_one' },
            new Map([['msg_one', { attachmentCount: 2, content: 'see these' }]])
        )
    ).toMatchObject({ preview: { attachmentCount: 2, content: 'see these' } });
    expect(
        agentTurnTrigger(
            { chatId: 'cht_one', source: 'human', visible: false, workId: 'msg_one' },
            new Map([['msg_one', { attachmentCount: 0, content: 'secret' }]])
        )
    ).toEqual({ kind: 'private' });
    expect(at('task_assignment', 'not-a-task-key')).toBeNull();
    expect(at('reminder')).toEqual({ chatId: 'cht_one', kind: 'reminder' });
    expect(at('trigger')).toEqual({ chatId: 'cht_one', kind: 'trigger' });
    expect(at('cloud_agent_work')).toEqual({ chatId: 'cht_one', kind: 'cloud_agent' });
    expect(at('onboarding')).toEqual({ chatId: 'cht_one', kind: 'onboarding' });
    expect(at('something_new')).toBeNull();
    expect(agentTurnTrigger(null)).toBeNull();
});

test('a heartbeat knows whether it reported, and a report names its heartbeat run', () => {
    const heartbeat = { chatId: null, runId: 'run_hb', source: 'heartbeat', visible: false };
    const reportedKeys = new Set(['heartbeat-report:run_hb']);
    expect(agentTurnTrigger({ ...heartbeat, workId: 'w' }, new Map(), reportedKeys)).toEqual({
        kind: 'heartbeat',
        reported: true,
    });
    expect(agentTurnTrigger({ ...heartbeat, workId: 'w' })).toEqual({
        kind: 'heartbeat',
        reported: false,
    });
    expect(
        agentTurnTrigger({
            chatId: null,
            source: 'heartbeat_report',
            visible: false,
            workId: 'heartbeat-report:run_hb',
        })
    ).toEqual({ heartbeatRunId: 'run_hb', kind: 'heartbeat_report' });
    expect(
        agentTurnTrigger({ chatId: null, source: 'heartbeat_report', visible: false, workId: 'x' })
    ).toBeNull();
});

test('a long trigger message is quoted only up to the preview bound, never mid-character', () => {
    const head = 'a'.repeat(AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH - 1);
    // An astral emoji straddles the bound: its surrogate pair is never split.
    expect(previewHead(`${head}🙂 and more`)).toBe(head);
    expect(previewHead(`${head}b and more`)).toBe(`${head}b`);
    expect(previewHead('short')).toBe('short');
});
