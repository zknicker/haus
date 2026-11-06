import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import type { HausClient } from './haus-client.ts';
import type { HausServerHarness } from './haus-server-harness.ts';

/**
 * A Channel with one Agent in it and a human Thread: the shape an Agent meets
 * when a request arrives as a Thread reply it then claims.
 */
export interface ThreadClaimScene {
    anchorId: string;
    chatId: string;
    chatName: string;
    replyId: string;
    runner: ResolvedRunner;
    serverId: string;
    threadChatId: string;
    threadTarget: string;
}

export async function seedThreadClaimScene(
    harness: HausServerHarness,
    owner: HausClient,
    slug: string
): Promise<ThreadClaimScene> {
    const server = await owner.trpc.server.create.mutate({ displayName: slug, slug });
    const chatId = server.channels[0].id;
    const chatName = server.channels[0].name ?? '';
    const runner = await seedAgentRunner(harness, { chatId, id: server.id }, 'piper');
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Kicking off the launch checklist',
        nonce: `${slug}:anchor`,
        serverId: server.id,
    });
    const reply = await sendThreadReply(owner, {
        anchorId: anchor.message.id,
        chatId,
        content: 'Can you draft the release notes?',
        nonce: `${slug}:reply`,
        serverId: server.id,
    });
    return {
        anchorId: anchor.message.id,
        chatId,
        chatName,
        replyId: reply.message.id,
        runner,
        serverId: server.id,
        threadChatId: reply.threadChatId ?? '',
        threadTarget: `#${chatName}:${anchor.message.id.slice(4, 12)}`,
    };
}

export async function sendThreadReply(
    owner: HausClient,
    input: { anchorId: string; chatId: string; content: string; nonce: string; serverId: string }
) {
    return await owner.trpc.chat.send.mutate({
        chatId: input.chatId,
        content: input.content,
        nonce: input.nonce,
        serverId: input.serverId,
        thread: { anchorMessageId: input.anchorId },
    });
}

export async function seedAgentRunner(
    harness: HausServerHarness,
    server: { chatId: string; id: string },
    handle: string
): Promise<ResolvedRunner> {
    const agentId = `agt_${handle}${server.id.slice(4, 12)}`;
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${server.id}, ${handle}, ${handle}, 'UTC')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${server.id}, ${server.chatId}, ${agentId})
    `;
    return {
        agentId,
        capabilities: [],
        chatId: server.chatId,
        computerId: `cmp_${handle}`,
        runId: `run_${handle}`,
        runnerId: `rnr_${handle}`,
        serverId: server.id,
    };
}
