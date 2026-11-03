import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let allChatId: string;
const slug = 'departure-hq';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_departure_owner', ['departure-owner@haus.test']);
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Departure HQ',
        slug,
    });
    serverId = server.id;
    allChatId = server.channels[0].id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('removal clears Thread follow and live composition state before reinvitation', async () => {
    const member = await signIn('user_departure_member', ['departure-member@haus.test']);
    await join(member, 'departure-member@haus.test');
    const memberUserId = await readUserId('user_departure_member');
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: allChatId,
        content: 'Departure anchor',
        nonce: 'departure-anchor',
        serverId,
    });
    const reply = await member.trpc.chat.send.mutate({
        chatId: allChatId,
        content: 'Following before removal',
        nonce: 'departure-reply',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    const threadChatId = reply.threadChatId as string;
    const compositions = subscribeToCompositions(owner, threadChatId);

    await compositions.started;
    await member.trpc.chat.publishComposition.mutate({
        chatId: threadChatId,
        compositionId: 'departure-draft',
        serverId,
        text: 'unfinished private draft',
    });
    await expect(compositions.draft).resolves.toMatchObject({
        actorUserId: memberUserId,
        chatId: threadChatId,
        text: 'unfinished private draft',
    });

    await owner.trpc.member.remove.mutate({
        confirmation: slug,
        serverId,
        userId: memberUserId,
    });

    await expect(compositions.cleared).resolves.toMatchObject({
        actorUserId: memberUserId,
        chatId: threadChatId,
        text: null,
    });
    const [afterRemoval] = await harness.sql`
        select count(*)::int as total from thread_follows
        where server_id = ${serverId} and user_id = ${memberUserId}
    `;
    expect(afterRemoval.total).toBe(0);

    await join(member, 'departure-member@haus.test');
    const parent = await member.trpc.chat.messages.query({ chatId: allChatId, serverId });
    expect(parent.threads).toMatchObject([{ followed: false, threadChatId }]);

    compositions.unsubscribe();
    member.close();
});

function subscribeToCompositions(client: HausClient, chatId: string) {
    const started = Promise.withResolvers<void>();
    const draft = Promise.withResolvers<unknown>();
    const cleared = Promise.withResolvers<unknown>();
    const subscription = client.trpc.chat.onComposition.subscribe(
        { chatId, serverId },
        {
            onData: (event) => {
                if (event.text === null) {
                    cleared.resolve(event);
                } else {
                    draft.resolve(event);
                }
            },
            onError: (error) => {
                started.reject(error);
                draft.reject(error);
                cleared.reject(error);
            },
            onStarted: () => started.resolve(),
        }
    );
    const timeout = setTimeout(() => {
        const error = new Error('Timed out waiting for the departure composition.');
        draft.reject(error);
        cleared.reject(error);
        subscription.unsubscribe();
    }, 1500);

    cleared.promise.finally(() => clearTimeout(timeout)).catch(() => undefined);
    return {
        cleared: cleared.promise,
        draft: draft.promise,
        started: started.promise,
        unsubscribe: () => subscription.unsubscribe(),
    };
}

async function join(client: HausClient, email: string) {
    const { token } = await owner.trpc.invitation.create.mutate({ email, serverId });
    await client.trpc.invitation.accept.mutate({ token });
}

async function readUserId(subject: string) {
    const [row] = await harness.sql`
        select id from users where auth_subject = ${subject}
    `;

    return row.id as string;
}

async function signIn(subject: string, verifiedEmails: string[]) {
    harness.humans.setVerifiedEmails(subject, verifiedEmails);
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}
