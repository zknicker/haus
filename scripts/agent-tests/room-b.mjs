// Shared evidence for the room scenarios where a second Agent speaks only
// through seeded messages (kit.authorAsAgent): every post one Agent made in a
// channel and its Threads, whether a post pings an Agent, and the first message
// an Agent addressed to the human.

import { humanAddressingReason } from './human-addressing.mjs';

/** The immutable link a resolved Agent mention serializes to. */
export function agentMentionLink(agentId) {
    return `agent://${encodeURIComponent(agentId)}`;
}

/** True when content @mentions this Agent, as a resolved link or a plain `@handle`. */
export function mentionsAgent(content, { handle, id }) {
    if (typeof content !== 'string') {
        return false;
    }
    if (content.includes(`(${agentMentionLink(id)})`)) {
        return true;
    }
    return new RegExp(`(?:^|[^\\w@])@${escapeRegExp(handle)}(?![\\w-])`, 'iu').test(content);
}

/**
 * An Agent's posts in a channel since `head`, top level and in every Thread.
 * Adapted from `scenarios/mention-wakes-only-addressed.mjs`.
 */
export async function agentPosts(kit, chatId, agentId, head = 0) {
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

/** Posts that address the human (mention, inline reply, or Thread on their message). */
export async function humanAddressedPosts(kit, { agentId, channelId, userId }) {
    const topLevel = await kit.readMessages(channelId);
    const own = (message) => message.author.kind === 'agent' && message.author.agentId === agentId;
    const addressed = topLevel.filter(
        (message) => own(message) && humanAddressingReason(message, userId) !== null
    );
    const page = await kit.trpc('chat.messages', {
        chatId: channelId,
        limit: 100,
        serverId: kit.serverId,
    });
    for (const thread of page.threads) {
        await kit.trackChat(thread.threadChatId);
        const anchorAuthor =
            topLevel.find((message) => message.id === thread.anchorMessageId)?.author ?? null;
        addressed.push(
            ...(await kit.readMessages(thread.threadChatId)).filter(
                (message) =>
                    own(message) && humanAddressingReason(message, userId, anchorAuthor) !== null
            )
        );
    }
    return addressed;
}

/**
 * The Agent's first message addressing the human, wherever it put it: top
 * level in the Channel or inside any Thread there, narrowed by `accept`. Copied from
 * `scenarios/human-ask-reply-wakes.mjs`, which keeps its copy private.
 */
export async function awaitHumanAddressing(
    kit,
    { accept = () => true, agentId, channelId, timeoutMs, userId }
) {
    const deadline = Date.now() + timeoutMs;
    const matches = (message, anchorAuthor = null) =>
        message.author.kind === 'agent' &&
        message.author.agentId === agentId &&
        humanAddressingReason(message, userId, anchorAuthor) !== null &&
        accept(message);
    const found = (message, thread, anchorAuthor = null) => ({
        message,
        reason: humanAddressingReason(message, userId, anchorAuthor),
        thread,
    });
    while (Date.now() < deadline) {
        const topLevel = await kit.readMessages(channelId);
        const direct = topLevel.find((message) => matches(message));
        if (direct) {
            return found(direct, null);
        }
        const page = await kit.trpc('chat.messages', {
            chatId: channelId,
            limit: 100,
            serverId: kit.serverId,
        });
        for (const thread of page.threads.filter((summary) => summary.replyCount > 0)) {
            const anchorAuthor =
                topLevel.find((message) => message.id === thread.anchorMessageId)?.author ?? null;
            const inThread = (await kit.readMessages(thread.threadChatId)).find((message) =>
                matches(message, anchorAuthor)
            );
            if (inThread) {
                await kit.trackChat(thread.threadChatId);
                return found(
                    inThread,
                    { anchorMessageId: thread.anchorMessageId, chatId: thread.threadChatId },
                    anchorAuthor
                );
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(
        `no Agent message @mentioning, inline-replying, or answering in a Thread on the human in ${channelId} or its Threads within ${Math.round(timeoutMs / 1000)}s.`
    );
}

/** Asserts a settled turn completed without a failure kind. */
export function expectSettled(expect, turn, label) {
    expect(turn.status, `${label} status`).toBe('completed');
    expect(turn.failureKind ?? 'none', `${label} failure kind`).toBe('none');
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
