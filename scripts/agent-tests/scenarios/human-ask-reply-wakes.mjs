// An Agent that needs a human asks where the work lives by @mentioning them,
// inline-replying to their message, or answering in a Thread on it (ADR 0037),
// and the human's reply in that same place wakes the Agent for a new turn.

import { answerPlacement, humanAddressingReason, humanAuthorId } from '../human-addressing.mjs';
import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An Agent that needs a human decision addresses that human in an ordinary message — an @mention with a resolved user:// link, an inline reply to their message, or a message in a Thread on it — and the human’s reply in the same place wakes the Agent for a new turn.',
    name: 'human-ask-reply-wakes',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [worker] = agents;
        const token = marker('DECIDE');
        const serverId = kit.serverId;

        const channel = await kit.createChannel({ agentIds: [worker.id] });
        log('asking for work that needs a human decision');
        await kit.harness.send(
            channel.id,
            [
                `@${worker.handle} ${token} Draft two candidate taglines for the Bluebird private-beta announcement.`,
                'Which one ships is my call, not yours, and the announcement cannot be unsent.',
                'Do not publish anything until I have picked.',
            ].join(' ')
        );
        const request = (await kit.readMessages(channel.id)).find((message) =>
            message.content.includes(token)
        );
        const userId = humanAuthorId(request);
        const member = await kit.trpc('member.get', { serverId, userId });
        if (!member?.handle) {
            throw new Error('The evaluating human has no handle, so no Agent can @mention them.');
        }

        const first = await settleTurn(worker.id);
        expect(first.status, 'asking turn status').toBe('completed');
        expect(first.failureKind ?? 'none', 'asking turn failure kind').toBe('none');

        log('finding the @mention, inline reply, or Thread answer to the human');
        const question = await awaitHumanAddressing(kit, {
            agentId: worker.id,
            channelId: channel.id,
            timeoutMs: 60_000,
            userId,
        });
        expect(question.message.body?.kind ?? 'text', 'question body kind').toBe('text');

        const placement = answerPlacement({
            channelId: channel.id,
            questionId: question.message.id,
            thread: question.thread,
        });
        expect(question.reason !== null, 'the question addresses the human').toBe(true);

        log('answering where the question was asked');
        const answerToken = marker('PICK');
        await kit.trpc('chat.send', {
            attachmentIds: [],
            chatId: placement.chatId,
            content: `${answerToken} Go with the first tagline.`,
            nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
            serverId,
            ...(placement.thread ? { thread: placement.thread } : {}),
            ...(placement.replyToMessageId ? { replyToMessageId: placement.replyToMessageId } : {}),
        });
        const answer = (await kit.readMessages(placement.answerChatId)).find((message) =>
            message.content.includes(answerToken)
        );
        if (!answer) {
            throw new Error(`The human answer never landed in ${placement.answerChatId}.`);
        }

        const second = await settleTurn(worker.id);
        expect(second.status, 'woken turn status').toBe('completed');
        expect(second.failureKind ?? 'none', 'woken turn failure kind').toBe('none');
        expect(second.runId !== first.runId, 'the answer woke a new turn').toBe(true);
    },
});

/**
 * The Agent's first message addressing the human — an @mention, an inline
 * reply to their message, or any message in a Thread anchored on one —
 * wherever it put it: top level in the Channel or inside any Thread there (a
 * task Thread or one anchored on the human's own request).
 */
async function awaitHumanAddressing(kit, { agentId, channelId, timeoutMs, userId }) {
    const deadline = Date.now() + timeoutMs;
    const matches = (message, anchorAuthor = null) =>
        message.author.kind === 'agent' &&
        message.author.agentId === agentId &&
        humanAddressingReason(message, userId, anchorAuthor) !== null;
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
