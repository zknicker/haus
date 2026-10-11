import { expect } from 'bun:test';
import type { CloudAgentStatus } from '@haus/api';
import type { cloudAgentFixture } from './cloud-agent-fixture.ts';
import type { HausClient } from './haus-client.ts';

type CloudAgentFixture = ReturnType<typeof cloudAgentFixture>;

/** Shared moves for ADR 0044 link tests: Channels, sends, and settling Runs. */
export function cloudAgentLinkHelpers(fixture: CloudAgentFixture) {
    return { agentPost, createChannel, humanSend, linkRows, observe, sendAsAgent };

    /** A Channel with Orbit, the owner, and the named extra members. */
    async function createChannel(name: string, memberUserIds: string[] = []) {
        const { id } = await fixture.owner.trpc.chat.createChannel.mutate({
            agentIds: [fixture.orbitAgentId],
            name,
            serverId: fixture.serverId,
        });
        for (const userId of memberUserIds) {
            await fixture.harness.sql`
                insert into channel_participants (server_id, chat_id, user_id)
                values (${fixture.serverId}, ${id}, ${userId})
            `;
        }
        return id;
    }

    async function humanSend(client: HausClient, chatId: string, content: string, nonce: string) {
        const sent = await client.trpc.chat.send.mutate({
            chatId,
            content,
            nonce,
            serverId: fixture.serverId,
        });
        return sent;
    }

    async function agentPost(runner: { token: string }, path: string, body: object) {
        const response = await fetch(new URL(path, fixture.harness.url), {
            body: JSON.stringify(body),
            headers: {
                authorization: `Bearer ${runner.token}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        return {
            body: (await response.json()) as Record<string, unknown>,
            status: response.status,
        };
    }

    /** Orbit reads the target first so the freshness check lets the send through. */
    async function sendAsAgent(
        runner: { runId: string; token: string },
        target: string,
        content: string,
        nonce: string
    ) {
        await fixture.readTarget(runner, target);
        const sent = await agentPost(runner, '/api/agent/messages/send', {
            content,
            nonce,
            target,
        });
        expect(sent.status).toBe(200);
        return sent.body as { message: { content: string; id: string } };
    }

    async function linkRows(messageId: string) {
        return (await fixture.harness.sql`
            select work_id, ordinal, chat_id from cloud_agent_work_links
            where server_id = ${fixture.serverId} and message_id = ${messageId}
            order by ordinal
        `) as { chat_id: string; ordinal: number; work_id: string }[];
    }

    async function observe(
        socket: WebSocket,
        input: { observedAt: string; runId: string; status: CloudAgentStatus; workId: string }
    ) {
        socket.send(JSON.stringify({ observation: input, type: 'cloud-agent-observation' }));
        await fixture.waitForWorkStatus(input.workId, input.status);
    }
}
