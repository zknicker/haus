import { expect, test } from 'bun:test';
import { parseStartCommand } from './agent-command-frames.ts';

const frame = {
    agentConversationStyle: 'Terse. Plain words. Dry humor.',
    agentDescription: 'Keeps release notes current.',
    agentId: 'agt_launchtest',
    agentSignatureEmoji: '👽',
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

test('carries the private conversation style and signature emoji from the start frame, apart from the inbox', () => {
    const command = parseStartCommand(frame);
    expect(command?.agentConversationStyle).toBe('Terse. Plain words. Dry humor.');
    expect(command?.agentSignatureEmoji).toBe('👽');
    expect(command?.inbox).toEqual([]);
    expect(parseStartCommand({ ...frame, agentConversationStyle: 7 })).toBeNull();
    expect(parseStartCommand({ ...frame, agentSignatureEmoji: 7 })).toBeNull();
});

test('a null signature emoji survives the parse so the prompt renders the default', () => {
    const command = parseStartCommand({ ...frame, agentSignatureEmoji: null });
    expect(command).not.toBeNull();
    expect(command?.agentSignatureEmoji).toBeNull();
    expect(parseStartCommand({ ...frame, agentConversationStyle: null })).toBeNull();
});
