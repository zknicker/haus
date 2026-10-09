import { afterEach, expect, spyOn, test } from 'bun:test';
import { TRPCError } from '@trpc/server';
import * as z from 'zod';
import { membershipLostError, RealtimeRefusalError } from './refusal.ts';
import { streamTopic } from './stream-topic.ts';
import { createTopic, type PreparedRealtimeEvent, publishRealtime } from './topic.ts';
import { messageCreatedTopic } from './topics.ts';

const pingSchema = z.object({ chatId: z.string(), serverId: z.string() }).strict();

afterEach(() => {
    spyOn(console, 'error').mockRestore();
});

test('prepare rejects a malformed event before anything is published', () => {
    expect(() =>
        messageCreatedTopic.prepare({
            authorUserId: null,
            chatId: 'cht_thread',
            conversationKind: 'channel',
            mentionedUserIds: [],
            messageId: 'msg_reply',
            // A Thread reply must name its anchor too.
            parentChatId: 'cht_parent',
            replyToAuthorUserId: null,
            sequence: 1,
            serverId: 'srv_one',
            threadAnchorAuthorUserId: null,
            threadAnchorMessageId: null,
        })
    ).toThrow();
});

test('a failed publish is logged with its topic and never throws to the writer', () => {
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: PreparedRealtimeEvent = {
        deliver: () => {
            throw new TypeError('listener exploded');
        },
        delivery: { audienceUserId: null, event: { serverId: 'srv_one' } },
        topic: 'test.failing',
    };

    expect(() => publishRealtime([failing, null])).not.toThrow();
    expect(logged).toHaveBeenCalledWith('[haus] realtime publish failed', {
        errorClass: 'TypeError',
        topic: 'test.failing',
    });
});

test('announce logs a malformed post-commit event instead of failing the write', () => {
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    const topic = createTopic('test.announce', pingSchema);

    expect(() => topic.announce({ chatId: 1 } as never)).not.toThrow();
    expect(logged).toHaveBeenCalledWith(
        '[haus] realtime publish failed',
        expect.objectContaining({ topic: 'test.announce' })
    );
});

test('an unexpected delivery error ends only its own stream, logged as internal', async () => {
    const logged = spyOn(console, 'error').mockImplementation(() => undefined);
    const topic = createTopic('test.isolation', pingSchema);
    const base = { access: async () => 'viewer', path: 'test.onPing', serverId: 'srv_one' };
    const failing = streamTopic({
        ...base,
        deliver: () => Promise.reject(new RangeError('visibility check failed')),
        signal: undefined,
        topic,
        viewerId: 'usr_one',
    });
    const sibling = new AbortController();
    const healthy = streamTopic({ ...base, signal: sibling.signal, topic, viewerId: 'usr_two' });

    const failed = failing.next();
    const first = healthy.next();
    await Bun.sleep(0);
    topic.announce({ chatId: 'cht_one', serverId: 'srv_one' });

    const error = await failed.then(
        () => null,
        (cause: unknown) => cause
    );
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
    expect(logged).toHaveBeenCalledWith('[haus] realtime stream failed', {
        code: 'INTERNAL_SERVER_ERROR',
        errorClass: 'RangeError',
        path: 'test.onPing',
    });
    expect((await first).value).toEqual({ chatId: 'cht_one', serverId: 'srv_one' });

    const second = healthy.next();
    await Bun.sleep(0);
    topic.announce({ chatId: 'cht_two', serverId: 'srv_one' });
    expect((await second).value).toEqual({ chatId: 'cht_two', serverId: 'srv_one' });
    sibling.abort();
    await expect(healthy.next()).resolves.toMatchObject({ done: true });
});

test('a stream skips other Servers and other readers, and ends coded on a refusal', async () => {
    const topic = createTopic('test.audience', pingSchema);
    let member = true;
    const stream = streamTopic({
        access: () => (member ? Promise.resolve('viewer') : Promise.reject(membershipLostError())),
        path: 'test.onPing',
        serverId: 'srv_one',
        signal: undefined,
        topic,
        viewerId: 'usr_reader',
    });

    const next = stream.next();
    await Bun.sleep(0);
    topic.announce({ chatId: 'cht_other_server', serverId: 'srv_two' });
    topic.announce(
        { chatId: 'cht_other_reader', serverId: 'srv_one' },
        { audienceUserId: 'usr_x' }
    );
    topic.announce({ chatId: 'cht_mine', serverId: 'srv_one' }, { audienceUserId: 'usr_reader' });
    expect((await next).value).toEqual({ chatId: 'cht_mine', serverId: 'srv_one' });

    member = false;
    const refused = stream.next();
    await Bun.sleep(0);
    topic.announce({ chatId: 'cht_after', serverId: 'srv_one' });
    const error = await refused.then(
        () => null,
        (cause: unknown) => cause
    );
    expect(error).toBeInstanceOf(RealtimeRefusalError);
    expect((error as RealtimeRefusalError).refusal).toBe('membership_lost');
});
