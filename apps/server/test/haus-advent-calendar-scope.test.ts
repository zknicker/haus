import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AdventCalendar } from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/** The calendar counts only Chats the member can read, and nothing under a deleted one. */

let harness: HausServerHarness;
let carol: HausClient;
let serverId: string;
let agentId: string;
let carolId: string;
let aliceId: string;
let lanternsId: string;

const computerId = 'cmp_adventscope00000';

beforeAll(async () => {
    harness = await startHausServerHarness();
    carol = await signIn('user_advent_carol');
    serverId = (
        await carol.trpc.server.create.mutate({ displayName: 'Scope Inn', slug: 'advent-scope' })
    ).id;
    carolId = harness.humans.userIdForSubject('user_advent_carol');
    const [alice, bob] = [await signIn('user_advent_alice'), await signIn('user_advent_bob')];
    await alice.trpc.server.create.mutate({ displayName: 'Alice', slug: 'advent-scope-alice' });
    await bob.trpc.server.create.mutate({ displayName: 'Bob', slug: 'advent-scope-bob' });
    alice.close();
    bob.close();
    aliceId = harness.humans.userIdForSubject('user_advent_alice');
    const bobId = harness.humans.userIdForSubject('user_advent_bob');
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role) values
            ('mem_advent_alice', ${serverId}, ${aliceId}, 'member'),
            ('mem_advent_bob', ${serverId}, ${bobId}, 'member')
    `;
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        ) values (
            ${computerId}, ${serverId}, ${carolId}, ${'f'.repeat(64)},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    agentId = (
        await carol.trpc.agent.create.mutate({
            computerId,
            displayName: 'Blippy',
            handle: 'scope-blippy',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).agent.id;
    lanternsId = (
        await carol.trpc.chat.createChannel.mutate({
            agentIds: [agentId],
            name: 'lanterns',
            serverId,
        })
    ).id;
    const sent = await carol.trpc.chat.send.mutate({
        chatId: lanternsId,
        content: 'hello',
        nonce: 'scope-hello',
        serverId,
    });
    await backdate(sent.message.id, '2025-04-01T15:00:00Z');

    // Alice mentions Carol once where Carol can read it, and once in a DM
    // between Alice and Bob that Carol cannot.
    const [one, two] = [aliceId, bobId].sort();
    await harness.sql`
        insert into chats (
            id, server_id, kind, dm_member_one_user_id, dm_member_one_stint,
            dm_member_two_user_id, dm_member_two_stint
        ) values ('cht_advent_dm_ab', ${serverId}, 'dm', ${one}, 1, ${two}, 1)
    `;
    await mentionCarol('cht_advent_dm_ab', 'msg_advent_mention_dm', 1);
    await mentionCarol(lanternsId, 'msg_advent_mention_lanterns', 1000);
});

afterAll(async () => {
    carol?.close();
    await harness?.close();
});

test('in-demand counts mentions only in Chats the member can read', async () => {
    const calendar = await read(23);
    expect(strongRuns(calendar, 'in-demand')).toEqual(['1']);
});

test('a soft-deleted channel takes its Threads out of every count', async () => {
    const baseline = await read(25);

    const attic = await carol.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        name: 'attic',
        serverId,
    });
    const anchor = await carol.trpc.chat.send.mutate({
        chatId: attic.id,
        content: 'anchor',
        nonce: 'attic-anchor',
        serverId,
    });
    const reply = await carol.trpc.chat.send.mutate({
        chatId: attic.id,
        content: 'reply',
        nonce: 'attic-reply',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    await backdate(anchor.message.id, '2025-04-02T15:00:00Z');
    await backdate(reply.message.id, '2025-04-02T15:05:00Z');
    if (!reply.threadChatId) {
        throw new Error('Expected the reply to open a Thread.');
    }
    await mentionCarol(reply.threadChatId, 'msg_advent_mention_attic', 1000);

    // The test bites: while the channel lives, its Thread counts.
    expect(strongRuns(await read(1), 'messages-sent')).toEqual(['3']);

    await harness.sql`
        update chats set deleted_at = now(), deleted_by_user_id = ${carolId} where id = ${attic.id}
    `;
    expect(await read(25)).toEqual(baseline);
});

async function read(throughDay: number): Promise<AdventCalendar> {
    return await carol.trpc.advent.calendar.query({
        serverId,
        throughDay,
        timeZone: 'America/New_York',
        year: 2025,
    });
}

async function mentionCarol(chatId: string, id: string, sequence: number) {
    await harness.sql`
        insert into chat_messages (
            id, server_id, chat_id, author_user_id, content, nonce, sequence,
            mentioned_user_ids, created_at
        ) values (
            ${id}, ${serverId}, ${chatId}, ${aliceId}, 'ping', ${id}, ${sequence},
            array[${carolId}]::text[], '2025-05-01T15:00:00Z'
        )
    `;
}

async function backdate(messageId: string, at: string) {
    await harness.sql`update chat_messages set created_at = ${at}::timestamptz where id = ${messageId}`;
}

function strongRuns(calendar: AdventCalendar, fact: string): string[] {
    const entry = calendar.entries.find((candidate) => candidate.fact === fact);
    if (!entry || entry.kind !== 'fact') {
        throw new Error(`No ${fact} door.`);
    }
    return entry.line.filter((run) => run.strong).map((run) => run.text);
}

async function signIn(subject: string) {
    harness.humans.setVerifiedEmails(subject, [`${subject}@example.com`]);
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
}
