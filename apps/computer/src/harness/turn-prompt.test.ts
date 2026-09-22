import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentInboxItem } from '../agent-inbox-item.ts';
import {
    readPendingInboxState,
    readRunVisibleMessages,
    replacePendingInbox,
} from '../inbox-store.ts';
import { attestComposedDrain, composeTurnPrompt, type TurnDelivery } from './turn-prompt.ts';

const dm: AgentInboxItem = {
    chatId: 'cht_dm',
    content: 'Can you look at the deploy?',
    createdAt: '2026-09-20T10:00:00.000Z',
    id: 'msg_dm000001',
    addressed: true,
    addressedReason: 'dm',
    senderHandle: 'operator',
    senderType: 'human',
    sequence: 4,
    target: 'dm:@operator',
};

const channel: AgentInboxItem = {
    chatId: 'cht_product',
    content: 'Standup at ten.',
    createdAt: '2026-09-20T09:00:00.000Z',
    id: 'msg_ch000001',
    senderHandle: 'operator',
    senderType: 'human',
    sequence: 9,
    target: '#product',
};

function delivery(overrides: Partial<TurnDelivery> = {}): TurnDelivery {
    return {
        agentId: 'agt_test',
        dataRoot: '/tmp/unused',
        drainItemIds: [dm.id],
        homeTimezone: 'UTC',
        inbox: [channel, dm],
        inboxDelivery: 'notice',
        runId: 'run_test',
        serverId: 'srv_test',
        totalPending: 2,
        unreadElsewhere: [],
        warmDrainItemIds: [channel.id],
        ...overrides,
    };
}

const cold = { isColdStart: true, sessionGeneration: 1 };
const warm = { isColdStart: false, sessionGeneration: 1 };

test('an alive session drains human messages while a cold start notices them', () => {
    const unaddressed = delivery({ drainItemIds: [], inbox: [channel] });

    const alive = composeTurnPrompt(unaddressed, warm);
    expect(alive.drained).toEqual([channel]);
    expect(alive.notice).toBeNull();
    expect(alive.turnContent).toContain('[target=#product msg=ch000001');

    const first = composeTurnPrompt(unaddressed, cold);
    expect(first.drained).toEqual([]);
    expect(first.turnContent).toContain('[Haus inbox notice:');
    expect(first.turnContent).not.toContain('Standup at ten.');
});

test('a cold start drains an addressed message beside the notice of the rest', () => {
    const prompt = composeTurnPrompt(delivery(), cold);

    expect(prompt.drained).toEqual([dm]);
    expect(prompt.turnContent).toContain('Can you look at the deploy?');
    expect(prompt.turnContent).not.toContain('Standup at ten.');
    // The notice covers only what the drain withheld, and it appears once.
    expect(prompt.notice).toContain('1 unread message total');
    expect(prompt.turnContent.split('[Haus inbox notice:')).toHaveLength(2);
    expect(prompt.turnContent.indexOf('New message received:')).toBeLessThan(
        prompt.turnContent.indexOf('[Haus inbox notice:')
    );
});

test('a busy turn still gets a content-free notice for everything it withholds', () => {
    const prompt = composeTurnPrompt(delivery({ drainItemIds: [], warmDrainItemIds: [] }), warm);

    expect(prompt.drained).toEqual([]);
    expect(prompt.turnContent).not.toContain('Can you look at the deploy?');
    expect(prompt.notice).toContain('2 unread messages total');
});

test("the unread digest prints Raft's wording after the prompt body", () => {
    const prompt = composeTurnPrompt(
        delivery({
            drainItemIds: [],
            inbox: [],
            totalPending: 0,
            unreadElsewhere: [
                { count: 3, target: '#product' },
                { count: 1, target: 'dm:@operator' },
            ],
            warmDrainItemIds: [],
        }),
        cold
    );

    expect(prompt.turnContent).toBe(
        [
            'Start.',
            '',
            'You also have unread messages in other channels:',
            '- #product: 3 unread',
            '- dm:@operator: 1 unread',
            'Use the inbox/read commands at a natural breakpoint if you choose to inspect those targets.',
        ].join('\n')
    );
});

test('an empty digest renders nothing', () => {
    const prompt = composeTurnPrompt(
        delivery({ drainItemIds: [], inbox: [], totalPending: 0, warmDrainItemIds: [] }),
        cold
    );

    expect(prompt.turnContent).toBe('Start.');
});

test('a composed drain records exact run visibility and consumes its notice rows', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-turn-prompt-'));
    try {
        const input = delivery({ dataRoot });
        const location = { agentId: input.agentId, dataRoot, serverId: input.serverId };
        await replacePendingInbox(location, input.inbox);

        await attestComposedDrain(input, composeTurnPrompt(input, cold).drained);

        expect(await readRunVisibleMessages(location, input.runId)).toEqual([
            { chatId: dm.chatId, id: dm.id, sequence: dm.sequence },
        ]);
        const pending = await readPendingInboxState(location);
        expect(pending.items.map((item) => item.id)).toEqual([channel.id]);
        expect(pending.consumedMessageIds).toEqual([dm.id]);
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a concrete drain is attested by acceptance, not by composition', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-turn-prompt-'));
    try {
        const input = delivery({ dataRoot, inboxDelivery: 'concrete' });
        await attestComposedDrain(input, [dm]);

        expect(
            await readRunVisibleMessages(
                { agentId: input.agentId, dataRoot, serverId: input.serverId },
                input.runId
            )
        ).toEqual([]);
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});
