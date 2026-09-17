import { expect, test } from 'bun:test';
import { captureRoutingEvidence } from './routing-evidence.mjs';

test('captures paginated parent messages, child destinations and every resumed journal', async () => {
    const tracked = [];
    const kit = {
        serverId: 'server',
        transcript: () => ({ chats: [{ id: 'parent' }] }),
        trackChat: async (id) => tracked.push(id),
        turns: {
            deliveryState: async () => ({ running: false }),
            listTurns: async () => [{ runId: 'completion' }, { runId: 'launch' }],
            listDeliveries: async () => [{ source: 'cloud_agent_work', chatId: 'parent' }],
        },
        trpc: async (procedure, input) => {
            if (procedure === 'agent.executionJournal') {
                return { status: 'available', journal: { runId: input.runId } };
            }
            if (input.chatId === 'child') {
                return { messages: [{ id: 'outcome' }], threads: [], nextBeforeSequence: null };
            }
            return input.beforeSequence
                ? { messages: [{ id: 'request' }], threads: [], nextBeforeSequence: null }
                : {
                      messages: [{ id: 'launch' }],
                      threads: [{ threadChatId: 'child' }],
                      nextBeforeSequence: 2,
                  };
        },
    };
    const evidence = await captureRoutingEvidence(kit, [{ id: 'agent' }]);
    expect(evidence.chats).toEqual([
        { chatId: 'parent', messages: [{ id: 'launch' }, { id: 'request' }] },
        { chatId: 'child', messages: [{ id: 'outcome' }] },
    ]);
    expect(evidence.journals.map((entry) => entry.runId)).toEqual(['completion', 'launch']);
    expect(tracked).toEqual(['child']);
    expect(evidence.errors).toEqual([]);
});

test('retains capture failures alongside the evidence still available', async () => {
    const evidence = await captureRoutingEvidence(
        {
            serverId: 'server',
            transcript: () => ({ chats: [{ id: 'parent' }] }),
            trpc: async () => {
                throw new Error('offline');
            },
        },
        []
    );
    expect(evidence.errors).toEqual([{ chatId: 'parent', error: 'Error: offline' }]);
});
