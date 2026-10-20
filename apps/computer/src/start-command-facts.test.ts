import { expect, test } from 'bun:test';
import { parseStartCommand } from './agent-command-frames.ts';

const frame = {
    agentId: 'agt_chipstest',
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

test('a start frame carries the Server connection chips into the command', () => {
    expect(
        parseStartCommand({ ...frame, connectionChips: ['amazon-product'] })?.connectionChips
    ).toEqual(['amazon-product']);
    expect(parseStartCommand(frame)?.connectionChips).toEqual([]);
});

test('a chip kind from a newer Server is dropped, and a malformed list rejects the frame', () => {
    expect(
        parseStartCommand({ ...frame, connectionChips: ['etsy-listing', 'linear-issue'] })
            ?.connectionChips
    ).toEqual(['linear-issue']);
    expect(parseStartCommand({ ...frame, connectionChips: 'amazon-product' })).toBeNull();
    expect(parseStartCommand({ ...frame, connectionChips: [7] })).toBeNull();
});
