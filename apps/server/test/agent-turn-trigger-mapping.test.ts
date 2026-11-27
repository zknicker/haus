import { expect, test } from 'bun:test';
import { AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH } from '@haus/api';
import { agentTurnTrigger, previewHead } from '../src/server-agents/agent-turn-trigger.ts';

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
    expect(at('claim_assignment', 'claim-assign:msg_claim:3')).toEqual({
        chatId: 'cht_one',
        kind: 'claim',
        messageId: 'msg_claim',
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
    expect(at('claim_assignment', 'not-a-claim-key')).toBeNull();
    expect(at('reminder')).toEqual({ chatId: 'cht_one', kind: 'reminder' });
    expect(at('trigger')).toEqual({ chatId: 'cht_one', kind: 'trigger' });
    expect(at('worker_report')).toBeNull();
    expect(at('pull_request')).toEqual({ chatId: 'cht_one', kind: 'pull_request' });
    expect(at('onboarding')).toEqual({ chatId: 'cht_one', kind: 'onboarding' });
    expect(at('greeting', 'greeting:agt_one')).toEqual({ chatId: 'cht_one', kind: 'greeting' });
    expect(at('something_new')).toBeNull();
    expect(agentTurnTrigger(null)).toBeNull();
});

test('a long trigger message is quoted only up to the preview bound, never mid-character', () => {
    const head = 'a'.repeat(AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH - 1);
    // An astral emoji straddles the bound: its surrogate pair is never split.
    expect(previewHead(`${head}🙂 and more`)).toBe(head);
    expect(previewHead(`${head}b and more`)).toBe(`${head}b`);
    expect(previewHead('short')).toBe('short');
});
