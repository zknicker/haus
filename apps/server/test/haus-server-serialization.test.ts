import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * Hosted durable writes take the Server row first, then authorize. That single
 * order is what makes removal actually immediate: a send already in flight
 * cannot slip past a revocation, and no two transactions can grab the Server
 * row and a Chat read row in opposite orders.
 */
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let allChatId: string;
const slug = 'serialize-hq';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_serialize_owner', ['serialize-owner@haus.test']);

    const created = await owner.trpc.server.create.mutate({ displayName: 'Serialize HQ', slug });
    serverId = created.id;
    allChatId = created.channels[0].id;
});

afterAll(async () => {
    await harness.close();
});

/**
 * Holds the Server row so both queued operations start from the same barrier,
 * making the interleaving deterministic instead of a race the test hopes to win.
 */
async function whileServerRowIsHeld<T>(run: () => Promise<T>): Promise<T> {
    const holding = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = harness.sql.begin(async (tx: typeof harness.sql) => {
        await tx`select id from servers where id = ${serverId} for update`;
        holding.resolve();
        await release.promise;
    });

    await holding.promise;

    try {
        return await run();
    } finally {
        release.resolve();
        await held;
    }
}

test('a send already in flight cannot commit after the author is removed', async () => {
    const author = await signIn('user_serialize_author', ['serialize-author@haus.test']);
    await join(author, 'serialize-author@haus.test');
    const authorUserId = await readUserId('user_serialize_author');

    const nonce = 'serialize-inflight';
    let removal: Promise<unknown> = Promise.resolve();
    let send: Promise<unknown> = Promise.resolve();

    await whileServerRowIsHeld(async () => {
        // Removal queues on the Server row first, then the send queues behind it.
        removal = owner.trpc.member.remove.mutate({
            confirmation: slug,
            serverId,
            userId: authorUserId,
        });
        await Bun.sleep(120);

        send = Promise.allSettled([
            author.trpc.chat.send.mutate({
                chatId: allChatId,
                content: 'Slipped past removal',
                nonce,
                serverId,
            }),
        ]);
        await Bun.sleep(120);
    });

    await expect(removal).resolves.toMatchObject({ userId: authorUserId });
    await expect(send).resolves.toMatchObject([
        {
            status: 'rejected',
            reason: { message: expect.stringMatching(/not a member/i) },
        },
    ]);

    const [stored] = await harness.sql`
        select count(*)::int as total from chat_messages
        where server_id = ${serverId} and nonce = ${nonce}
    `;
    expect(stored.total).toBe(0);
});

test('a read marker already in flight cannot commit after the reader is removed', async () => {
    const reader = await signIn('user_serialize_reader', ['serialize-reader@haus.test']);
    await join(reader, 'serialize-reader@haus.test');
    const readerUserId = await readUserId('user_serialize_reader');

    await owner.trpc.chat.send.mutate({
        chatId: allChatId,
        content: 'Something to read',
        nonce: 'serialize-readable',
        serverId,
    });

    let removal: Promise<unknown> = Promise.resolve();
    let markRead: Promise<unknown> = Promise.resolve();

    await whileServerRowIsHeld(async () => {
        removal = owner.trpc.member.remove.mutate({
            confirmation: slug,
            serverId,
            userId: readerUserId,
        });
        await Bun.sleep(120);

        markRead = Promise.allSettled([
            reader.trpc.chat.markRead.mutate({
                chatId: allChatId,
                sequence: 1,
                serverId,
            }),
        ]);
        await Bun.sleep(120);
    });

    await expect(removal).resolves.toMatchObject({ userId: readerUserId });
    await expect(markRead).resolves.toMatchObject([
        {
            status: 'rejected',
            reason: { message: expect.stringMatching(/not a member/i) },
        },
    ]);

    const [reads] = await harness.sql`
        select count(*)::int as total from chat_reads
        where server_id = ${serverId} and reader_user_id = ${readerUserId}
    `;
    expect(reads.total).toBe(0);
});

test('a rename already in flight cannot commit after the member is removed', async () => {
    const editor = await signIn('user_serialize_editor', ['serialize-editor@haus.test']);
    await join(editor, 'serialize-editor@haus.test');
    const editorUserId = await readUserId('user_serialize_editor');
    let removal: Promise<unknown> = Promise.resolve();
    let rename: Promise<unknown> = Promise.resolve();

    await whileServerRowIsHeld(async () => {
        removal = owner.trpc.member.remove.mutate({
            confirmation: slug,
            serverId,
            userId: editorUserId,
        });
        await Bun.sleep(120);

        rename = Promise.allSettled([
            editor.trpc.server.rename.mutate({
                displayName: 'Unauthorized rename',
                serverId,
            }),
        ]);
        await Bun.sleep(120);
    });

    await expect(removal).resolves.toMatchObject({ userId: editorUserId });
    await expect(rename).resolves.toMatchObject([
        {
            status: 'rejected',
            reason: { message: expect.stringMatching(/not a member/i) },
        },
    ]);
    await expect(owner.trpc.server.bySlug.query({ slug })).resolves.toMatchObject({
        displayName: 'Serialize HQ',
    });
    editor.close();
});

test('removal never deadlocks against concurrent reads and sends', async () => {
    const crowd = await Promise.all(
        Array.from({ length: 6 }, async (_unused, index) => {
            const email = `serialize-crowd-${index}@haus.test`;
            const client = await signIn(`user_serialize_crowd_${index}`, [email]);
            await join(client, email);

            return {
                client,
                userId: await readUserId(`user_serialize_crowd_${index}`),
            };
        })
    );

    const attempts = await Promise.allSettled(
        crowd.flatMap(({ client, userId }, index) => [
            client.trpc.chat.send.mutate({
                chatId: allChatId,
                content: `Crowd ${index}`,
                nonce: `serialize-crowd-${index}`,
                serverId,
            }),
            client.trpc.chat.markRead.mutate({ chatId: allChatId, sequence: 1, serverId }),
            owner.trpc.member.remove.mutate({ confirmation: slug, serverId, userId }),
        ])
    );

    const deadlocked = attempts.filter(
        (attempt) =>
            attempt.status === 'rejected' && /deadlock/i.test(String(attempt.reason?.message))
    );

    expect(deadlocked).toHaveLength(0);
    // The Server still stands, and its Owner is untouched.
    await expect(owner.trpc.server.bySlug.query({ slug })).resolves.toMatchObject({
        role: 'owner',
    });
});

async function join(client: HausClient, email: string) {
    const { token } = await owner.trpc.invitation.create.mutate({ email, serverId });
    await client.trpc.invitation.accept.mutate({ token });
}

async function readUserId(clerkUserId: string) {
    const [row] = await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `;

    return row.id as string;
}

async function signIn(clerkUserId: string, verifiedEmails: string[]) {
    harness.clerkUsers.setVerifiedEmails(clerkUserId, verifiedEmails);

    const token = await harness.clerk.mintSessionToken(clerkUserId);

    return createHausClient(harness, token);
}
