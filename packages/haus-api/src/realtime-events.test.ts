import { expect, test } from 'bun:test';
import {
    computerUpdatedEventSchema,
    memberUpdatedEventSchema,
    realtimeRefusalSchema,
    serverUpdatedEventSchema,
} from './realtime-events.ts';
import { taskChangedEventSchema } from './task.ts';

test('only three refusal classes exist, each coded rather than a bare tRPC code', () => {
    expect(realtimeRefusalSchema.options).toEqual([
        'chat_missing',
        'membership_lost',
        'role_required',
    ]);
    expect(realtimeRefusalSchema.safeParse('FORBIDDEN').success).toBe(false);
    expect(realtimeRefusalSchema.safeParse('NOT_FOUND').success).toBe(false);
});

test('a member notice always names the member', () => {
    expect(memberUpdatedEventSchema.parse({ memberId: 'mem_1', serverId: 'srv_1' })).toEqual({
        memberId: 'mem_1',
        serverId: 'srv_1',
    });
    expect(() => memberUpdatedEventSchema.parse({ memberId: null, serverId: 'srv_1' })).toThrow();
});

test('Server deletion is membership loss, not a server.onUpdated action', () => {
    expect(() =>
        serverUpdatedEventSchema.parse({ action: 'deleted', serverId: 'srv_1' })
    ).toThrow();
});

test('Agent skill and workspace changes never ride the Computer notice', () => {
    expect(() =>
        computerUpdatedEventSchema.parse({ agentId: 'agt_1', computerId: null, serverId: 'srv_1' })
    ).toThrow();
});

test('a task notice names the Message and carries no task row', () => {
    const event = {
        chatId: 'cht_1',
        kind: 'updated' as const,
        messageId: 'msg_1',
        serverId: 'srv_1',
    };
    expect(taskChangedEventSchema.parse(event)).toEqual(event);
    expect(() => taskChangedEventSchema.parse({ ...event, task: {} })).toThrow();
});
