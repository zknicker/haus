import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { collectStream } from './realtime-stream.ts';

// Refusal classes over a real tRPC WebSocket (specs/realtime-events.md,
// "Refusal classes"). A membership refusal keeps its domain cause, and
// `serverProcedure` remaps errors by cause class, so these prove the code
// survives the middleware chain and reaches the client as error data.
let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let stranger: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_refusals_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Refusals',
        slug: 'refusals',
    });
    serverId = server.id;
    member = await signIn('user_refusals_member');
    await member.trpc.server.create.mutate({
        displayName: 'Refusals member root',
        slug: 'refusals-member-root',
    });
    const [user] = (await harness.sql`
        select id from users where auth_subject = 'user_refusals_member'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_refusals_member', ${serverId}, ${user?.id ?? ''}, 'member')
    `;
    stranger = await signIn('user_refusals_stranger');
    await stranger.trpc.server.create.mutate({
        displayName: 'Refusals stranger root',
        slug: 'refusals-stranger-root',
    });
});

afterAll(async () => {
    owner.close();
    member.close();
    stranger.close();
    await harness.close();
});

test('a non-member starting a stream is refused with membership_lost', async () => {
    const stream = collectStream(stranger.trpc.server.onUpdated, { serverId });

    await expect(stream.ended()).resolves.toMatchObject({
        data: { code: 'FORBIDDEN', hausRefusal: 'membership_lost' },
    });
});

test('a stream on a missing Server is refused with membership_lost, not NOT_FOUND', async () => {
    const stream = collectStream(owner.trpc.agent.onUpdated, { serverId: 'srv_refusals_missing' });

    await expect(stream.ended()).resolves.toMatchObject({
        data: { code: 'FORBIDDEN', hausRefusal: 'membership_lost' },
    });
});

test('role-gated streams refuse a member with role_required at start', async () => {
    for (const stream of [
        collectStream(member.trpc.reminder.onUpdated, { serverId }),
        collectStream(member.trpc.invitation.onUpdated, { serverId }),
    ]) {
        await expect(stream.ended()).resolves.toMatchObject({
            data: { code: 'FORBIDDEN', hausRefusal: 'role_required' },
        });
    }
});

test('a per-Chat stream on a missing Chat is refused with chat_missing', async () => {
    const chatId = 'cht_refusals_missing';
    for (const stream of [
        collectStream(owner.trpc.chat.onThought, { chatId, serverId }),
        collectStream(owner.trpc.chat.onEngagement, { chatId, serverId }),
    ]) {
        await expect(stream.ended()).resolves.toMatchObject({
            data: { code: 'NOT_FOUND', hausRefusal: 'chat_missing' },
        });
    }

    const read = await owner.trpc.chat.engagements.query({ chatId, serverId }).then(
        () => null,
        (error: { data?: Record<string, unknown> }) => error
    );
    expect(read?.data?.code).toBe('NOT_FOUND');
    expect(read?.data?.hausRefusal).toBeUndefined();
});

test('a non-stream access failure carries no refusal class', async () => {
    const failure = await stranger.trpc.chat.list.query({ serverId }).then(
        () => null,
        (error: { data?: Record<string, unknown> }) => error
    );

    expect(failure?.data?.code).toBe('FORBIDDEN');
    expect(failure?.data?.hausRefusal).toBeUndefined();
});

async function signIn(subject: string) {
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
}
