import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentThreadContext } from '@haus/api';
import { parseInbox } from './agent-inbox-input.ts';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import {
    attestComposedDrain,
    composeTurnPrompt,
    type TurnDelivery,
} from './harness/turn-prompt.ts';
import { composeInboxDrain, composeInboxNotice } from './inbox-format.ts';
import { readRunVisibleMessages } from './inbox-store.ts';

const context: AgentThreadContext = {
    parentMessage: {
        chatId: 'cht_product',
        content: 'Should we cut the release today?',
        createdAt: '2026-09-20T09:00:00.000Z',
        id: 'msg_parent01',
        senderDescription: 'Product owner',
        senderHandle: 'zach',
        senderType: 'human',
        sequence: 41,
    },
    parentTarget: '#product',
    recentMessages: [
        {
            chatId: 'cht_thread',
            content: 'The migration is still flaky.',
            createdAt: '2026-09-20T09:05:00.000Z',
            id: 'msg_reply001',
            senderHandle: 'kit',
            senderType: 'agent',
            sequence: 1,
        },
    ],
    suggestedReadTarget: '#product:parent01',
    threadTarget: '#product:parent01',
    truncated: false,
};

const mention: AgentInboxItem = {
    addressed: true,
    addressedReason: 'mention',
    chatId: 'cht_thread',
    content: '@ada can you weigh in?',
    createdAt: '2026-09-20T09:10:00.000Z',
    id: 'msg_mention1',
    mentioned: true,
    senderHandle: 'zach',
    senderType: 'human',
    sequence: 2,
    target: '#product:parent01',
    threadContext: context,
};

test('renders the thread context block before the mention it introduces', () => {
    expect(composeInboxDrain([mention], 'UTC')).toBe(
        [
            'New message received:',
            '',
            '[Haus thread context: you were mentioned in a thread without model-visible context.]',
            'parent: #product',
            'thread: #product:parent01',
            'suggested next step: haus message read --target "#product:parent01"',
            '',
            'Parent message:',
            '- [msg=parent01 seq=41 time=2026-09-20 09:00:00 type=human] @zach — Product owner: Should we cut the release today?',
            '',
            'Recent thread context:',
            '- [msg=reply001 seq=1 time=2026-09-20 09:05:00 type=agent] @kit: The migration is still flaky.',
            '',
            '[target=#product:parent01 msg=mention1 time=2026-09-20 09:10:00 type=human mentioned=true] @zach: @ada can you weigh in?',
            '',
            'Respond as appropriate. Complete all your work before stopping.',
            "Each message's `target` identifies the conversation where it was asked.",
        ].join('\n')
    );
});

test('marks a truncated history and an empty one', () => {
    const truncated = composeInboxDrain(
        [{ ...mention, threadContext: { ...context, truncated: true } }],
        'UTC'
    );
    expect(truncated).toContain('Recent thread context (truncated):\n- [msg=reply001');

    const empty = composeInboxDrain(
        [{ ...mention, threadContext: { ...context, recentMessages: [] } }],
        'UTC'
    );
    expect(empty).toContain('Recent thread context:\n- (no earlier thread replies)\n\n[target=');
});

test('introduces each Thread once per prompt', () => {
    const second = { ...mention, id: 'msg_mention2', sequence: 3 };
    const other: AgentInboxItem = {
        ...mention,
        id: 'msg_mention3',
        target: '#ops:root0001',
        threadContext: {
            ...context,
            suggestedReadTarget: '#ops:root0001',
            threadTarget: '#ops:root0001',
        },
    };
    const drain = composeInboxDrain([mention, second, other], 'UTC');

    expect(drain.split('[Haus thread context:')).toHaveLength(3);
    expect(drain.indexOf('thread: #product:parent01')).toBeLessThan(drain.indexOf('msg=mention1'));
    expect(drain.indexOf('thread: #ops:root0001')).toBeGreaterThan(drain.indexOf('msg=mention2'));
});

test('renders on a cold start and on a warm resume, never in a notice', () => {
    for (const session of [
        { isColdStart: true, sessionGeneration: 1 },
        { isColdStart: false, sessionGeneration: 1 },
    ]) {
        expect(composeTurnPrompt(delivery(), session).turnContent).toContain(
            '[Haus thread context: you were mentioned'
        );
    }
    const busy = composeTurnPrompt(delivery({ drainItemIds: [] }), {
        isColdStart: true,
        sessionGeneration: 1,
    });
    expect(busy.drained).toEqual([]);
    expect(busy.turnContent).not.toContain('Haus thread context');
    expect(composeInboxNotice([mention])).not.toContain('Should we cut the release today?');
});

test('a rendered block attests the quoted messages it showed whole', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-thread-context-'));
    try {
        const clipped = {
            ...mention,
            threadContext: {
                ...context,
                parentMessage: { ...context.parentMessage, clipped: true },
            },
        };
        const input = delivery({ dataRoot, inbox: [clipped] });
        await attestComposedDrain(input, [clipped]);

        expect(
            await readRunVisibleMessages(
                { agentId: input.agentId, dataRoot, serverId: input.serverId },
                input.runId
            )
        ).toEqual([
            { chatId: 'cht_thread', id: 'msg_mention1', sequence: 2 },
            { chatId: 'cht_thread', id: 'msg_reply001', sequence: 1 },
        ]);
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a malformed thread context fails the frame closed', () => {
    expect(parseInbox([{ ...mention, threadContext: { threadTarget: '#x' } }])).toBeNull();
    expect(parseInbox([mention])?.[0]?.threadContext).toEqual(context);
});

function delivery(overrides: Partial<TurnDelivery> = {}): TurnDelivery {
    return {
        agentId: 'agt_test',
        dataRoot: '/tmp/unused',
        drainItemIds: [mention.id],
        homeTimezone: 'UTC',
        inbox: [mention],
        inboxDelivery: 'notice',
        runId: 'run_test',
        serverId: 'srv_test',
        totalPending: 1,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        ...overrides,
    };
}
