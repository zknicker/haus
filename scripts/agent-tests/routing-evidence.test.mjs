import { expect, test } from 'bun:test';
import { captureRoutingEvidence } from './routing-evidence.mjs';

test('captures every tracked chat and its Tasks, paginated, and every resumed journal', async () => {
    const kit = {
        serverId: 'server',
        transcript: () => ({ chats: [{ id: 'parent' }] }),
        turns: {
            deliveryState: async () => ({ running: false }),
            listTurns: async () => [{ runId: 'completion' }, { runId: 'launch' }],
            listDeliveries: async () => [{ source: 'worker_report', chatId: 'parent' }],
        },
        trpc: async (procedure, input) => {
            if (procedure === 'agent.executionJournal') {
                return { status: 'available', journal: { runId: input.runId } };
            }
            if (input.chatId === 'task') {
                return { messages: [{ id: 'outcome' }], nextBeforeSequence: null };
            }
            const task = { chatId: 'task', originMessageId: 'launch', taskId: 'tsk_1' };
            return input.beforeSequence
                ? { messages: [{ id: 'request' }], nextBeforeSequence: null }
                : { messages: [{ id: 'launch' }], nextBeforeSequence: 2, tasks: [task] };
        },
    };
    const evidence = await captureRoutingEvidence(kit, [{ id: 'agent' }]);
    expect(evidence.chats).toEqual([
        {
            chatId: 'parent',
            messages: [{ id: 'launch' }, { id: 'request' }],
            tasks: [{ chatId: 'task', originMessageId: 'launch', taskId: 'tsk_1' }],
        },
        { chatId: 'task', messages: [{ id: 'outcome' }], tasks: [] },
    ]);
    expect(evidence.journals.map((entry) => entry.runId)).toEqual(['completion', 'launch']);
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
