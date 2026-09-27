import { expect, test } from 'bun:test';
import type { ChatEngagement } from '@haus/api';
import {
    type ChatEngagementEnd,
    chatTypingReplyHoldMs,
    releaseChatTypingHolds,
    resolveChatTypingEnd,
    withHeldEngagements,
} from './chat-typing-hold.ts';

const endedAt = '2026-09-25T01:26:44.900Z';
const end = (reason: ChatEngagementEnd['reason']): ChatEngagementEnd => ({
    agentId: 'agt_blippy',
    chatId: 'cht_all',
    emittedAt: endedAt,
    reason,
    runId: 'run_one',
    serverId: 'srv_one',
    type: 'chat.engagement.ended',
});
const message = (createdAt: string, overrides: { agentId?: string; runId?: string } = {}) => ({
    author: { agentId: overrides.agentId ?? 'agt_blippy', kind: 'agent' as const },
    createdAt,
    runId: overrides.runId ?? 'run_one',
});
const interim = message('2026-09-25T01:26:10.000Z');
const reply = message('2026-09-25T01:26:44.880Z');

test('a --done end whose reply is already in the transcript launches 😊 at once', () => {
    expect(resolveChatTypingEnd(end('sent'), [interim, reply], 0)).toEqual({
        face: '😊',
        kind: 'face',
    });
});

test('a --done end whose reply has not rendered holds the dots, ignoring interim posts', () => {
    expect(resolveChatTypingEnd(end('sent'), [interim], 1000)).toEqual({
        hold: { end: end('sent'), expiresAt: 1000 + chatTypingReplyHoldMs },
        kind: 'hold',
    });
    // Another Agent's or another run's message is not this reply.
    const others = [
        message('2026-09-25T01:26:44.890Z', { agentId: 'agt_tiny' }),
        message('2026-09-25T01:26:44.890Z', { runId: 'run_two' }),
    ];
    expect(resolveChatTypingEnd(end('sent'), others, 1000).kind).toBe('hold');
});

test('a hold releases when the reply lands, and not before', () => {
    const hold = { end: end('sent'), expiresAt: 3000 };
    expect(releaseChatTypingHolds([hold], [interim], 1500)).toEqual({
        kept: [hold],
        released: [],
    });
    expect(releaseChatTypingHolds([hold], [interim, reply], 1600)).toEqual({
        kept: [],
        released: [hold],
    });
});

test('a hold releases at its deadline even when the reply never arrives', () => {
    const hold = { end: end('sent'), expiresAt: 3000 };
    expect(releaseChatTypingHolds([hold], [], 2999).released).toEqual([]);
    expect(releaseChatTypingHolds([hold], [], 3000).released).toEqual([hold]);
});

test('a run that settled without writing here launches 👀', () => {
    expect(resolveChatTypingEnd(end('settled'), [], 0)).toEqual({ face: '👀', kind: 'face' });
    expect(
        resolveChatTypingEnd(end('settled'), [message(endedAt, { agentId: 'agt_tiny' })], 0)
    ).toEqual({ face: '👀', kind: 'face' });
});

test('a run that wrote here without --done, or was interrupted, launches nothing', () => {
    expect(resolveChatTypingEnd(end('settled'), [interim], 0)).toEqual({ kind: 'none' });
    expect(resolveChatTypingEnd(end('interrupted'), [], 0)).toEqual({ kind: 'none' });
});

test('held Agents stay in the strip after live engagements, once per run', () => {
    const live: ChatEngagement = {
        agentId: 'agt_tiny',
        chatId: 'cht_all',
        runId: 'run_tiny',
        startedAt: endedAt,
    };
    const hold = { end: end('sent'), expiresAt: 3000 };
    expect(withHeldEngagements([live], [hold])).toEqual([
        live,
        { agentId: 'agt_blippy', chatId: 'cht_all', runId: 'run_one', startedAt: endedAt },
    ]);
    const engaged = [live, { ...live, agentId: 'agt_blippy', runId: 'run_one' }];
    expect(withHeldEngagements(engaged, [hold])).toBe(engaged);
    expect(withHeldEngagements([live], [])).toEqual([live]);
});
