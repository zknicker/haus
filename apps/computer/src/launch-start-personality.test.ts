import { expect, test } from 'bun:test';
import { parseStartCommand } from './launch.ts';

test('carries the private personality from the start frame, apart from the inbox', () => {
    const frame = {
        agentDescription: 'Keeps release notes current.',
        agentId: 'agt_launchtest',
        agentPersonality: 'Terse. Plain words. Dry humor.',
        chatId: 'cht_origin',
        inbox: [],
        inboxDelivery: 'notice',
        modelId: 'gpt-5',
        runId: 'run_launchtest',
        runtimeId: 'codex',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    };
    const command = parseStartCommand(frame);
    expect(command?.agentPersonality).toBe('Terse. Plain words. Dry humor.');
    expect(command?.inbox).toEqual([]);
    expect(parseStartCommand({ ...frame, agentPersonality: 7 })).toBeNull();
});
