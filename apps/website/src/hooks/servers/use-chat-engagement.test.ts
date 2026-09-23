import { expect, test } from 'bun:test';
import type { ChatEngagementEvent, ChatEngagements } from '@haus/api';
import { applyChatEngagementEvent } from './use-chat-engagement.ts';

const base = {
    agentId: 'agt_juniper',
    chatId: 'cht_general',
    emittedAt: '2026-09-23T12:00:00.000Z',
    runId: 'run_one',
    serverId: 'srv_one',
} as const;

const started = { ...base, type: 'chat.engagement.started' } satisfies ChatEngagementEvent;
const ended = {
    ...base,
    reason: 'sent',
    type: 'chat.engagement.ended',
} satisfies ChatEngagementEvent;

const juniper: ChatEngagements['engagements'][number] = {
    agentId: base.agentId,
    chatId: base.chatId,
    runId: base.runId,
    startedAt: base.emittedAt,
};

test('a started event adds the engagement with its emission time', () => {
    expect(applyChatEngagementEvent({ engagements: [] }, started)).toEqual({
        engagements: [juniper],
    });
});

test('a started event for a known run keeps the cached list', () => {
    const current = { engagements: [juniper] };
    expect(applyChatEngagementEvent(current, started)).toBe(current);
});

test('a started event appends after earlier engagements', () => {
    const cove = { ...juniper, agentId: 'agt_cove', runId: 'run_two' };
    const next = applyChatEngagementEvent({ engagements: [cove] }, started);
    expect(next.engagements.map((engagement) => engagement.agentId)).toEqual([
        'agt_cove',
        'agt_juniper',
    ]);
});

test('an ended event removes only that Agent run', () => {
    const nextRun = { ...juniper, runId: 'run_two' };
    const cove = { ...juniper, agentId: 'agt_cove' };
    expect(applyChatEngagementEvent({ engagements: [juniper, nextRun, cove] }, ended)).toEqual({
        engagements: [nextRun, cove],
    });
});

test('an ended event for an unknown run keeps the cached list', () => {
    const current = { engagements: [{ ...juniper, runId: 'run_other' }] };
    expect(applyChatEngagementEvent(current, ended)).toBe(current);
});
