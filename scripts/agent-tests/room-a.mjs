// Shared seams for the room scenarios: one Agent's reactions on a message, and
// a peer claim made through the same runner contract the Computer uses, so a
// seeded claim is indistinguishable from one a real `haus task claim` made.

import { createAgentAuthor } from './author.mjs';

/** An Agent's posts in a fresh channel since `head`, top level and in every Thread. */
export async function agentPostsSince(kit, chatId, agentId, head) {
    const own = (message) => message.author.kind === 'agent' && message.author.agentId === agentId;
    const posts = (await kit.readMessages(chatId)).filter(
        (message) => own(message) && message.sequence > head
    );
    const page = await kit.trpc('chat.messages', { chatId, limit: 100, serverId: kit.serverId });
    for (const thread of page.threads) {
        await kit.trackChat(thread.threadChatId);
        posts.push(...(await kit.readMessages(thread.threadChatId)).filter(own));
    }
    return posts;
}

/** The reactions `agentId` left on `message`. */
export function agentReactions(message, agentId) {
    return (message?.reactions ?? []).filter((reaction) =>
        reaction.actors.some((actor) => actor.kind === 'agent' && actor.id === agentId)
    );
}

/**
 * Claims the top-level message `messageId` as `agentId` (promoting it to a
 * task), exactly like `haus task claim --message-id`. Throws unless the Server
 * granted the claim, so a scenario never runs on an unseeded lock.
 */
export async function claimMessageAsAgent(kit, { agentId, channel, messageId }) {
    const author = createAgentAuthor({
        serverId: kit.serverId,
        serverUrl: kit.harness.serverUrl,
        stamp: kit.stamp,
    });
    const token = await author.mint(agentId, channel.id);
    const response = await fetch(`${kit.harness.serverUrl}/api/agent/tasks/claim`, {
        body: JSON.stringify({ messageId, target: `#${channel.name}` }),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const payload = await response.json().catch(() => null);
    const [result] = payload?.results ?? [];
    if (!(response.ok && result?.outcome === 'claimed')) {
        throw new Error(
            `Agent ${agentId} could not claim ${messageId} (${response.status}): ${JSON.stringify(payload)?.slice(0, 300)}`
        );
    }
    return result;
}
