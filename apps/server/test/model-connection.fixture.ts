import { modelConnectionsUpdatedTopic } from '../src/realtime/topics.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import type { HausServerHarness } from './haus-server-harness.ts';

export interface ConnectionServer {
    computerId: string;
    owner: HausClient;
    serverId: string;
}

export async function seedConnectionServer(harness: HausServerHarness, slug: string) {
    const subject = `user_${slug.replaceAll('-', '_')}_owner`;
    harness.humans.setVerifiedEmails(subject, [`${subject}@haus.test`]);
    const owner = await signIn(harness, subject);
    const serverId = (await owner.trpc.server.create.mutate({ displayName: slug, slug })).id;
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId,
    });
    const computerId = `cmp_${slug.replaceAll('-', '').padEnd(16, 'x').slice(0, 16)}`;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId}, ${serverId}, ${harness.humans.userIdForSubject(subject)}, ${new Bun.CryptoHasher('sha256').update(computerId).digest('hex')},
            ${{
                runtimes: [
                    { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] },
                    {
                        id: 'claude',
                        label: 'Claude Code',
                        models: [{ id: 'claude-opus', label: 'Claude Opus' }],
                    },
                ],
            }}::jsonb,
            'healthy'
        )
    `;
    const seeded: ConnectionServer = { computerId, owner, serverId };
    return seeded;
}

export async function createAgent(
    seed: ConnectionServer,
    handle: string,
    runtime: 'claude' | 'codex'
) {
    const created = await seed.owner.trpc.agent.create.mutate({
        computerId: seed.computerId,
        displayName: handle,
        handle,
        modelId: runtime === 'claude' ? 'claude-opus' : 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runtimeId: runtime,
        serverId: seed.serverId,
    });
    return created.agent.id;
}

export async function addMember(
    harness: HausServerHarness,
    seed: ConnectionServer,
    subject: string
) {
    const email = `${subject}@haus.test`;
    harness.humans.setVerifiedEmails(subject, [email]);
    const { token } = await seed.owner.trpc.invitation.create.mutate({
        email,
        serverId: seed.serverId,
    });
    const member = await signIn(harness, subject);
    await member.trpc.invitation.accept.mutate({ token });
    return member;
}

export async function addClaudeConnection(seed: ConnectionServer, label: string, token: string) {
    return await seed.owner.trpc.modelConnections.add.mutate({
        credential: { kind: 'setup-token', token },
        label,
        provider: 'claude',
        serverId: seed.serverId,
    });
}

export async function connectionsAnnounced(serverId: string) {
    for await (const delivery of modelConnectionsUpdatedTopic.subscribe()) {
        if (delivery.event.serverId === serverId) {
            return;
        }
    }
}

async function signIn(harness: HausServerHarness, subject: string) {
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
}
