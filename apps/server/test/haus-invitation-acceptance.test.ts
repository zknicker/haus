import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { collectStream } from './realtime-stream.ts';

/**
 * Acceptance is one PostgreSQL transaction: the invitation is validated and
 * consumed, the verified Cloudflare email must match, and the human lands as a
 * Member joined to exactly `#all`. The token is single-use under concurrency.
 */
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let serverSlug: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_accept_owner', ['owner@haus.test']);

    const created = await owner.trpc.server.create.mutate({
        displayName: 'Acceptance HQ',
        slug: 'acceptance-hq',
    });
    serverId = created.id;
    serverSlug = created.slug;
});

afterAll(async () => {
    await harness.close();
});

test('a matching verified email accepts once and lands in #all only', async () => {
    const invitee = await signIn('user_accept_joiner', ['joiner@haus.test']);
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'joiner@haus.test',
        serverId,
    });

    const preview = await invitee.trpc.invitation.preview.query({ token });
    expect(preview).toEqual({
        emailMatches: true,
        serverDisplayName: 'Acceptance HQ',
        serverSlug: 'acceptance-hq',
    });

    const accepted = await invitee.trpc.invitation.accept.mutate({ token });
    expect(accepted).toEqual({ serverId, serverSlug });

    const opened = await invitee.trpc.server.bySlug.query({ slug: serverSlug });
    expect(opened.role).toBe('member');

    const chats = await invitee.trpc.chat.list.query({ serverId });
    expect(chats).toHaveLength(1);
    expect(chats[0]).toMatchObject({ isAll: true, name: 'all' });

    const listed = await owner.trpc.invitation.list.query({ serverId });
    expect(listed.find((invitation) => invitation.email === 'joiner@haus.test')?.status).toBe(
        'accepted'
    );

    await expect(invitee.trpc.invitation.accept.mutate({ token })).rejects.toThrow(
        /no longer available/i
    );
});

test('a different verified email cannot consume the invitation', async () => {
    const stranger = await signIn('user_accept_stranger', ['stranger@haus.test']);
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'intended@haus.test',
        serverId,
    });

    const preview = await stranger.trpc.invitation.preview.query({ token });
    expect(preview.emailMatches).toBe(false);
    // The preview must never disclose whose address the invitation is bound to.
    expect(JSON.stringify(preview)).not.toContain('intended@haus.test');

    await expect(stranger.trpc.invitation.accept.mutate({ token })).rejects.toThrow(
        /different verified email/i
    );
    await expect(stranger.trpc.server.bySlug.query({ slug: serverSlug })).rejects.toThrow(
        /not a member/i
    );

    const listed = await owner.trpc.invitation.list.query({ serverId });
    expect(listed.find((invitation) => invitation.email === 'intended@haus.test')?.status).toBe(
        'pending'
    );
});

test('a human with no verified address cannot accept', async () => {
    const unverified = await signIn('user_accept_unverified', []);
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'unverified@haus.test',
        serverId,
    });

    await expect(unverified.trpc.invitation.preview.query({ token })).resolves.toMatchObject({
        emailMatches: false,
    });
    await expect(unverified.trpc.invitation.accept.mutate({ token })).rejects.toThrow(
        /different verified email/i
    );
});

test('revoked, expired, and unknown tokens are refused identically', async () => {
    const candidate = await signIn('user_accept_lapsed', ['lapsed@haus.test']);

    const revoked = await owner.trpc.invitation.create.mutate({
        email: 'lapsed@haus.test',
        serverId,
    });
    await owner.trpc.invitation.revoke.mutate({
        invitationId: revoked.invitation.id,
        serverId,
    });

    const expired = await owner.trpc.invitation.create.mutate({
        email: 'lapsed@haus.test',
        serverId,
    });
    await harness.sql`
        update server_invitations
        set expires_at = now() - interval '1 minute'
        where id = ${expired.invitation.id}
    `;

    for (const token of [revoked.token, expired.token, 'not-a-real-token']) {
        await expect(candidate.trpc.invitation.accept.mutate({ token })).rejects.toThrow(
            /no longer available/i
        );
        await expect(candidate.trpc.invitation.preview.query({ token })).rejects.toThrow(
            /no longer available/i
        );
    }
});

test('availability is judged on the PostgreSQL clock, not the application clock', async () => {
    const candidate = await signIn('user_accept_boundary', ['boundary@haus.test']);
    const created = await owner.trpc.invitation.create.mutate({
        email: 'boundary@haus.test',
        serverId,
    });

    // One second short of expiry: still listed pending, still previewable, and
    // still acceptable. Both answers have to come from the same clock.
    await harness.sql`
        update server_invitations set expires_at = now() + interval '1 second'
        where id = ${created.invitation.id}
    `;
    const listedBefore = await owner.trpc.invitation.list.query({ serverId });
    expect(listedBefore.find((entry) => entry.id === created.invitation.id)?.status).toBe(
        'pending'
    );
    await expect(
        candidate.trpc.invitation.preview.query({ token: created.token })
    ).resolves.toMatchObject({ emailMatches: true });

    // One second past expiry: the listed status and acceptance agree.
    await harness.sql`
        update server_invitations set expires_at = now() - interval '1 second'
        where id = ${created.invitation.id}
    `;
    const listedAfter = await owner.trpc.invitation.list.query({ serverId });
    expect(listedAfter.find((entry) => entry.id === created.invitation.id)?.status).toBe('expired');
    await expect(candidate.trpc.invitation.accept.mutate({ token: created.token })).rejects.toThrow(
        /no longer available/i
    );
    await expect(candidate.trpc.invitation.preview.query({ token: created.token })).rejects.toThrow(
        /no longer available/i
    );
});

test('an existing member accepting keeps their standing and the invitation live', async () => {
    const existing = await signIn('user_accept_existing', ['existing@haus.test']);
    const first = await owner.trpc.invitation.create.mutate({
        email: 'existing@haus.test',
        serverId,
    });
    await existing.trpc.invitation.accept.mutate({ token: first.token });

    // Fixture: role management is a later slice. Promoting directly keeps this
    // slice about acceptance refusing to touch an existing standing.
    await harness.sql`
        update server_memberships set role = 'admin'
        where server_id = ${serverId} and user_id = ${await readUserId('user_accept_existing')}
    `;

    const second = await owner.trpc.invitation.create.mutate({
        email: 'existing@haus.test',
        serverId,
    });
    await expect(existing.trpc.invitation.accept.mutate({ token: second.token })).rejects.toThrow(
        /already a member/i
    );

    // The standing they already hold is untouched, and the unused invitation
    // stays available for an Owner to revoke.
    await expect(existing.trpc.server.bySlug.query({ slug: serverSlug })).resolves.toMatchObject({
        role: 'admin',
    });
    const listed = await owner.trpc.invitation.list.query({ serverId });
    expect(listed.find((invitation) => invitation.id === second.invitation.id)?.status).toBe(
        'pending'
    );
});

test('concurrent acceptances of one token yield exactly one membership', async () => {
    const racer = await signIn('user_accept_racer', ['racer@haus.test']);
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'racer@haus.test',
        serverId,
    });

    const attempts = await Promise.allSettled(
        Array.from({ length: 6 }, () => racer.trpc.invitation.accept.mutate({ token }))
    );

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);

    const racerUserId = await readUserId('user_accept_racer');
    const [membershipCount] = await harness.sql`
        select count(*)::int as total from server_memberships
        where server_id = ${serverId} and user_id = ${racerUserId}
    `;
    expect(membershipCount.total).toBe(1);

    const [participantCount] = await harness.sql`
        select count(*)::int as total from channel_participants
        where server_id = ${serverId} and user_id = ${racerUserId}
    `;
    expect(participantCount.total).toBe(1);
});

test('a verified email remains bound to one Haus user', async () => {
    const shared = 'shared@haus.test';
    await signIn('user_accept_shared_one', [shared]);
    await expect(signIn('user_accept_shared_two', [shared])).rejects.toThrow(
        /belongs to another human/i
    );
    const [alias] = await harness.sql`
        select user_id from user_verified_emails where email = ${shared}
    `;
    expect(alias.user_id).toBe(await readUserId('user_accept_shared_one'));
});

test('acceptance publishes the new member id and the invitation change', async () => {
    const invitee = await signIn('user_accept_announced', ['announced@haus.test']);
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'announced@haus.test',
        serverId,
    });
    const members = collectStream(owner.trpc.member.onUpdated, { serverId });
    const invitations = collectStream(owner.trpc.invitation.onUpdated, { serverId });
    await Promise.all([members.started, invitations.started]);

    await invitee.trpc.invitation.accept.mutate({ token });

    const memberId = await readUserId('user_accept_announced');
    await expect(members.next()).resolves.toEqual({ memberId, serverId });
    await expect(invitations.next()).resolves.toEqual({ serverId });
    members.stop();
    invitations.stop();
});

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
