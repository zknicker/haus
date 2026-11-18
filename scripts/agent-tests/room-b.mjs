// Shared evidence for the room scenarios where a second Agent speaks only
// through seeded messages (kit.authorAsAgent): every post one Agent made in a

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
 * An Agent's posts in a channel since `head`, top level and inline.
 * Adapted from `scenarios/mention-wakes-only-addressed.mjs`.
 */
export async function agentPosts(kit, chatId, agentId, head = 0) {
    const own = (message) => message.author.kind === 'agent' && message.author.agentId === agentId;
    return (await kit.readMessages(chatId)).filter(
        (message) => own(message) && message.sequence > head
    );
}

export async function humanAddressedPosts(kit, { agentId, channelId, userId }) {
    const own = (message) => message.author.kind === 'agent' && message.author.agentId === agentId;
    return (await kit.readMessages(channelId)).filter(
        (message) => own(message) && humanAddressingReason(message, userId) !== null
    );
}

/**
 * The Agent's first message addressing the human in the Channel, narrowed by `accept`.
 * Copied from `scenarios/human-ask-reply-wakes.mjs`, which keeps its copy private.
 */
export async function awaitHumanAddressing(
    kit,
    { accept = () => true, agentId, channelId, timeoutMs, userId }
) {
    const deadline = Date.now() + timeoutMs;
    const matches = (message) =>
        message.author.kind === 'agent' &&
        message.author.agentId === agentId &&
        humanAddressingReason(message, userId) !== null &&
        accept(message);
    while (Date.now() < deadline) {
        const direct = (await kit.readMessages(channelId)).find(matches);
        if (direct) {
            return { message: direct, reason: humanAddressingReason(direct, userId) };
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(
        `no Agent message @mentioning or inline-replying to the human in ${channelId} within ${Math.round(timeoutMs / 1000)}s.`
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
