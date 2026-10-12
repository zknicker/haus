import { expect, test } from 'bun:test';
import { activeWorkLocations } from '../../../../../packages/haus-api/src/cloud-agent-work-fixture.ts';
import { cloudAgentWorkOpenTarget } from './active-cloud-agent-work-location.ts';

test('the launch work Thread peeks', () => {
    expect(cloudAgentWorkOpenTarget(activeWorkLocations.workThread)).toEqual({
        kind: 'work-thread',
    });
});

test('a Channel Message without a Thread is revealed in its Channel', () => {
    expect(cloudAgentWorkOpenTarget(activeWorkLocations.message)).toEqual({
        chatId: 'cht_tech_ops',
        kind: 'message',
        messageId: 'msg_linking_elsewhere',
    });
});

test('a Message in or anchoring a Thread opens that Thread, never the Channel', () => {
    const inThread = { ...activeWorkLocations.message, threadChatId: 'cht_reply_thread' };
    expect(cloudAgentWorkOpenTarget(inThread)).toEqual({
        kind: 'thread',
        threadChatId: 'cht_reply_thread',
    });
});
