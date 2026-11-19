import { expect, test } from 'bun:test';
import { parseStartCommand } from './agent-command-frames.ts';
import { turnDeliveryOf } from './harness/turn-prompt.ts';

const frame = {
    agentId: 'agt_chipstest',
    agentName: 'chips',
    chatId: 'cht_origin',
    drainItemIds: [],
    inbox: [],
    inboxDelivery: 'notice',
    modelId: 'gpt-5',
    runId: 'run_chipstest',
    runtimeId: 'codex',
    sessionGeneration: 1,
    totalPending: 0,
    type: 'start',
};

test('a start frame carries the Server connection chips into the turn', () => {
    const command = parseStartCommand({ ...frame, connectionChips: ['amazon-product'] });
    expect(command && turnDeliveryOf(command).connectionChips).toEqual(['amazon-product']);
    expect(parseStartCommand(frame)?.connectionChips).toEqual([]);
});

test('a chip kind from a newer Server is dropped, and a malformed list rejects the frame', () => {
    expect(
        parseStartCommand({ ...frame, connectionChips: ['etsy-listing', 'amazon-product'] })
            ?.connectionChips
    ).toEqual(['amazon-product']);
    expect(parseStartCommand({ ...frame, connectionChips: 'amazon-product' })).toBeNull();
    expect(parseStartCommand({ ...frame, connectionChips: [7] })).toBeNull();
});

test('a start frame names the Agent handle, and a frame without one is rejected', () => {
    expect(parseStartCommand(frame)?.agentName).toBe('chips');
    expect(parseStartCommand({ ...frame, agentName: undefined })).toBeNull();
    expect(parseStartCommand({ ...frame, agentName: '' })).toBeNull();
});
