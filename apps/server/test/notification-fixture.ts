import { expect } from 'bun:test';
import { recordExactMessagesServed } from '../src/agent-delivery/cursors.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import type { PushSender } from '../src/push/push-sender.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const computerId = `cmp_${'n'.repeat(16)}`;
const credentialHash = 'c'.repeat(64);

export type NotificationFixture = Awaited<ReturnType<typeof startNotificationFixture>>;

/**
 * One Server for notification and unread tests: Ada (owner, `@ada`), Bo (member), Cass
 * (member outside every test Channel), and the Agents Orbit and Scout on one
 * Computer. Agent sends go through the real Agent API.
 */
export async function startNotificationFixture(options: { pushSender?: PushSender } = {}) {
    const harness = await startHausServerHarness(options);
    const database = await connectHausDatabase(harness.databaseUrl);
    const signIn = async (clerkUserId: string, verifiedEmails: string[]) => {
        harness.clerkUsers.setVerifiedEmails(clerkUserId, verifiedEmails);
        return createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
    };
    const readUserId = async (clerkUserId: string) => {
        const rows = (await harness.sql`
            select id from users where clerk_user_id = ${clerkUserId}
        `) as { id: string }[];
        return rows[0]?.id ?? '';
    };
    const owner = await signIn('user_notify_owner', ['ada@haus.test']);
    const peer = await signIn('user_notify_peer', ['bo@haus.test']);
    const outsider = await signIn('user_notify_outsider', ['cass@haus.test']);
    const serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Notify HQ', slug: 'notify-hq' })
    ).id;
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId,
    });
    const join = async (client: HausClient, email: string, name: string, handle: string) => {
        const { token } = await owner.trpc.invitation.create.mutate({ email, serverId });
        await client.trpc.invitation.accept.mutate({ token });
        await client.trpc.member.updateProfile.mutate({
            description: null,
            displayName: name,
            handle,
            serverId,
        });
    };
    await join(peer, 'bo@haus.test', 'Bo', 'bo');
    await join(outsider, 'cass@haus.test', 'Cass', 'cass');
    const ownerUserId = await readUserId('user_notify_owner');
    const peerUserId = await readUserId('user_notify_peer');
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        )
        values (
            ${computerId}, ${serverId}, ${ownerUserId}, ${credentialHash},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    const createAgent = async (displayName: string, handle: string) =>
        (
            await owner.trpc.agent.create.mutate({
                computerId,
                displayName,
                handle,
                modelId: 'gpt-5.6-sol',
                runtimeId: 'codex',
                serverId,
            })
        ).agent.id;
    const orbitAgentId = await createAgent('Orbit', 'orbit');
    const scoutAgentId = await createAgent('Scout', 'scout');

    const context = {
        database,
        harness,
        orbitAgentId,
        outsider,
        owner,
        ownerUserId,
        peer,
        peerUserId,
        scoutAgentId,
        serverId,
        signIn,
    };
    return {
        ...context,
        close: async () => {
            owner.close();
            peer.close();
            outsider.close();
            await database.close();
            await harness.close();
        },
        createChannel: (name: string) => createChannel(context, name),
        mintRunner: (agentId: string, runId: string, chatId: string) =>
            mintRunner(harness, agentId, runId, chatId),
        sendAgentMessage: (
            runner: Runner,
            target: string,
            nonce: string,
            content: string,
            replyToMessageId?: string
        ) =>
            sendAgentMessage({ database, harness, serverId }, runner, {
                content,
                nonce,
                target,
                ...(replyToMessageId ? { replyToMessageId } : {}),
            }),
    };
}

interface Runner {
    agentId: string;
    runId: string;
    token: string;
}

async function createChannel(
    context: {
        harness: HausServerHarness;
        orbitAgentId: string;
        owner: HausClient;
        peerUserId: string;
        scoutAgentId: string;
        serverId: string;
    },
    name: string
) {
    const { id } = await context.owner.trpc.chat.createChannel.mutate({
        agentIds: [context.orbitAgentId, context.scoutAgentId],
        name,
        serverId: context.serverId,
    });
    await context.harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${context.serverId}, ${id}, ${context.peerUserId})
    `;
    return id;
}

/**
 * Reading the target and recording that exact visibility is what the Computer
 * proxy does for a real turn; without it the send is freshness-held.
 */
async function sendAgentMessage(
    context: {
        database: Awaited<ReturnType<typeof connectHausDatabase>>;
        harness: HausServerHarness;
        serverId: string;
    },
    runner: Runner,
    input: { content: string; nonce: string; replyToMessageId?: string; target: string }
) {
    const url = new URL('/api/agent/history', context.harness.url);
    url.searchParams.set('target', input.target);
    const history = await fetch(url, { headers: { authorization: `Bearer ${runner.token}` } });
    // A Thread the send is about to open has no history yet.
    expect([200, 404]).toContain(history.status);
    const served =
        history.status === 200
            ? ((await history.json()) as { messages?: Array<{ chat_id: string; id: string }> })
            : {};
    await recordExactMessagesServed(context.database.db, {
        agentId: runner.agentId,
        messages: (served.messages ?? []).map((message) => ({
            chatId: message.chat_id,
            id: message.id,
        })),
        runId: runner.runId,
        serverId: context.serverId,
    });
    const response = await fetch(new URL('/api/agent/messages/send', context.harness.url), {
        body: JSON.stringify(input),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const body = (await response.json()) as { message?: { id: string }; state?: string };
    expect({ state: body.state, status: response.status }).toEqual({ state: 'sent', status: 200 });
    return { messageId: body.message?.id as string };
}

async function mintRunner(
    harness: HausServerHarness,
    agentId: string,
    runId: string,
    chatId: string
): Promise<Runner> {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({ agentId, chatId, credentialHash, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    const { runnerToken } = (await response.json()) as { runnerToken: string };
    return { agentId, runId, token: runnerToken };
}
