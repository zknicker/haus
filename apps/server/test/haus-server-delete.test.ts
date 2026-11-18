import { afterAll, beforeAll, expect, test } from 'bun:test';
import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { openAttachmentRoot } from '../src/attachments/attachment-root.ts';
import { ComputerConnections } from '../src/computers/connections.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { markServerDeleting, purgeDeletedServer } from '../src/servers/delete-server.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let serverId: string;
const slug = 'vanishing-hq';
const clients: HausClient[] = [];
const runtime = makeTestRuntime();

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('server-delete-owner');
    member = await signIn('server-delete-member');
    await member.trpc.server.create.mutate({
        displayName: 'Member Root',
        slug: 'server-delete-member-root',
    });
    serverId = (await owner.trpc.server.create.mutate({ displayName: 'Vanishing HQ', slug })).id;
    const memberUserId = await userId('server-delete-member');
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_server_delete_member', ${serverId}, ${memberUserId}, 'member')
    `;
});

afterAll(async () => {
    for (const client of clients) {
        client.close();
    }
    await runtime.dispose();
    await harness.close();
});

test('rechecks current Owner authority and the exact immutable slug', async () => {
    await expect(
        member.trpc.server.delete.mutate({ confirmation: slug, serverId })
    ).rejects.toThrow(/Owner/i);
    await expect(
        owner.trpc.server.delete.mutate({ confirmation: 'wrong', serverId })
    ).rejects.toThrow(/address exactly/i);
    await expect(owner.trpc.server.bySlug.query({ slug })).resolves.toMatchObject({ id: serverId });

    const staleOwner = await signIn('server-delete-stale-owner');
    const stale = await staleOwner.trpc.server.create.mutate({
        displayName: 'Stale Owner',
        slug: 'stale-owner-hq',
    });
    await harness.sql`
        update server_memberships set role = 'admin'
        where server_id = ${stale.id} and user_id = ${await userId('server-delete-stale-owner')}
    `;
    await expect(
        staleOwner.trpc.server.delete.mutate({
            confirmation: stale.slug,
            serverId: stale.id,
        })
    ).rejects.toThrow(/Owner/i);
});

test('defers every internal foreign key in the Server cascade', async () => {
    const immediateCrossLinks = await harness.sql`
        with recursive cascaded(oid) as (
            select 'servers'::regclass::oid
            union
            select constraint_row.conrelid
            from pg_constraint constraint_row
            join cascaded parent on constraint_row.confrelid = parent.oid
            where constraint_row.contype = 'f' and constraint_row.confdeltype = 'c'
        )
        select constraint_row.conname
        from pg_constraint constraint_row
        where constraint_row.contype = 'f'
          and constraint_row.confrelid in (select oid from cascaded)
          and constraint_row.conrelid in (select oid from cascaded)
          and constraint_row.confdeltype in ('a', 'r')
          and not constraint_row.condeferrable
        order by constraint_row.conname
    `;

    expect(immediateCrossLinks).toEqual([]);
});

test('revokes immediately, never waits for an offline Computer, and asynchronously cascades', async () => {
    const invitation = await owner.trpc.invitation.create.mutate({
        email: 'future-member@haus.test',
        serverId,
    });
    const [allChannel] = (await harness.sql`
        select id from chats where server_id = ${serverId} and is_all = true
    `) as { id: string }[];
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values ('agt_deleteauthor000', ${serverId}, 'delete-author', 'Delete Author', 'UTC')
    `;
    await harness.sql`
        update chats set last_message_sequence = 1 where id = ${allChannel.id}
    `;
    await harness.sql`
        insert into chat_messages (
            id, server_id, chat_id, sequence, nonce, author_agent_id, content
        ) values (
            'msg_deleteauthored00', ${serverId}, ${allChannel.id}, 1,
            'delete-authored-message', 'agt_deleteauthor000', 'Delete me with the Server.'
        )
    `;
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash
        ) values (
            'cmp_deleteoffline000', ${serverId}, ${await userId('server-delete-owner')},
            ${'a'.repeat(64)}
        )
    `;
    const root = await openAttachmentRoot(harness.attachmentRoot, runtime);
    const serverAttachmentPath = join(
        root.path,
        dirname(dirname(root.objectKey(serverId, 'att_1234567890abcdef')))
    );
    const staging = await root.createStagingFile(serverId, 'upl_deletefixture000');
    await staging.close();

    const deletion = await owner.trpc.server.delete.mutate({ confirmation: slug, serverId });

    expect(deletion).toMatchObject({ serverId, status: 'pending' });
    await expect(owner.trpc.server.bySlug.query({ slug })).rejects.toThrow(/No Haus server/i);
    await expect(member.trpc.server.bySlug.query({ slug })).rejects.toThrow(/No Haus server/i);
    const status = await waitForDeletion(deletion.deletionId);
    expect(status).toMatchObject({ error: null, serverId, status: 'completed' });
    await expect(owner.trpc.server.list.query()).resolves.toEqual([]);

    const [remaining] = (await harness.sql`
        select
            (select count(*)::int from servers where id = ${serverId}) as servers,
            (select count(*)::int from server_memberships where server_id = ${serverId}) as memberships,
            (select count(*)::int from server_invitations where server_id = ${serverId}) as invitations,
            (select count(*)::int from computers where server_id = ${serverId}) as computers,
            (select count(*)::int from chats where server_id = ${serverId}) as chats
    `) as {
        chats: number;
        computers: number;
        invitations: number;
        memberships: number;
        servers: number;
    }[];
    expect(remaining).toEqual({
        chats: 0,
        computers: 0,
        invitations: 0,
        memberships: 0,
        servers: 0,
    });
    await expect(lstat(serverAttachmentPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(invitation.invitation.id).toBeTruthy();
    await expect(owner.trpc.server.bySlug.query({ slug })).rejects.toThrow();
    await expect(
        owner.trpc.server.create.mutate({ displayName: 'Vanishing HQ Again', slug })
    ).resolves.toMatchObject({ slug });
});

test('sends cleanup only to online Computers for the deleted Server and does not wait', () => {
    const frames: unknown[] = [];
    let disconnected = false;
    const connections = new ComputerConnections(runtime);
    connections.register('cmp_online', {
        disconnect: () => {
            disconnected = true;
        },
        ordinary: true,
        send: (frame) => frames.push(frame),
        serverId,
        updatePhase: 'idle',
    });
    connections.register('cmp_other', {
        ordinary: true,
        send: (frame) => frames.push(frame),
        serverId: 'srv_other000000000',
        updatePhase: 'idle',
    });

    expect(connections.cleanupServer(serverId)).toBe(1);
    expect(frames).toEqual([{ type: 'server-delete' }]);
    expect(disconnected).toBe(true);
    expect(connections.isOnline('cmp_online')).toBe(false);
    expect(connections.isOnline('cmp_other')).toBe(true);
});

test('a closing Computer socket cannot block asynchronous deletion', () => {
    const connections = new ComputerConnections(runtime);
    connections.register('cmp_closing', {
        disconnect: () => {
            throw new Error('already closed');
        },
        ordinary: true,
        send: () => {
            throw new Error('socket closing');
        },
        serverId,
        updatePhase: 'idle',
    });

    expect(connections.cleanupServer(serverId)).toBe(0);
    expect(connections.isOnline('cmp_closing')).toBe(false);
});

test('keeps a failed asynchronous purge observable without restoring access', async () => {
    const failureOwner = await signIn('server-delete-failure-owner');
    const server = await failureOwner.trpc.server.create.mutate({
        displayName: 'Failure HQ',
        slug: 'failure-hq',
    });
    const connection = await connectHausDatabase(harness.databaseUrl);
    try {
        const user = await findUserById(
            connection.db,
            harness.humans.userIdForSubject('server-delete-failure-owner')
        );
        const deletion = await markServerDeleting(connection.db, user, {
            confirmation: server.slug,
            serverId: server.id,
        });
        const root = await openAttachmentRoot(harness.attachmentRoot, runtime);
        await purgeDeletedServer(
            connection.db,
            {
                ...root,
                purgeServer: () => Promise.reject(new Error('injected purge failure')),
            },
            deletion
        );

        await expect(
            failureOwner.trpc.server.bySlug.query({ slug: server.slug })
        ).rejects.toThrow();
        await expect(
            failureOwner.trpc.server.deletionStatus.query({
                deletionId: deletion.deletionId,
            })
        ).resolves.toMatchObject({
            error: 'injected purge failure',
            status: 'failed',
        });

        await purgeDeletedServer(connection.db, root, deletion);
    } finally {
        await connection.close();
    }
});

async function waitForDeletion(deletionId: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const status = await owner.trpc.server.deletionStatus.query({ deletionId });
        if (status.status !== 'pending') {
            return status;
        }
        await Bun.sleep(10);
    }
    throw new Error('Server deletion did not finish.');
}

async function signIn(subject: string) {
    const client = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    clients.push(client);
    return client;
}

async function userId(subject: string) {
    const [row] = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    return row.id;
}
