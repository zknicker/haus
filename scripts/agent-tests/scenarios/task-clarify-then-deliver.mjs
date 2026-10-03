// A claimed task asks for its missing input inline where the request arrived,
// uses the fresh answer, and only then hands the work to review. The task Thread
// on the human's request stays empty (ADR 0029). Ownership, inline routing, and
// task state move together across two live turns.

import { defineScenario } from '../scenario.mjs';

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'An Agent that needs missing input claims its task, asks inline in the channel before drafting, delivers the marked draft inline in the channel after the answer arrives, never posts in the task Thread, and leaves the task in_review still assigned to itself.',
    name: 'task-clarify-then-deliver',
    async run({ agents, expect, kit, log, marker, settleTurn }) {
        const [worker] = agents;
        const token = marker('AUDIENCE');

        const channel = await kit.createChannel({ agentIds: [worker.id] });
        log('sending task');
        const inChannel = async (turn) =>
            (await turn.authoredMessagesIn(channel.id)).filter(
                (message) => message.chatId === channel.id
            );
        const created = await kit.sendTask(
            channel.id,
            `@${worker.handle} Draft a two-sentence Bluebird launch blurb. Before drafting, ask me which audience to target; wait for my answer, then draft for that audience and move the task to review.`
        );

        const clarifying = await settleTurn(worker.id);
        expect(clarifying.status, 'clarification turn status').toBe('completed');
        expect(clarifying.failureKind ?? 'none', 'clarification turn failure kind').toBe('none');

        log('checking claim gates');
        const claimed = await kit.readTask(created.messageId);
        // An Agent that asked its question and paused may already have handed the
        // task to review; the contract here is claim-before-question, not the
        // transient state. The in_review gate after delivery still stands.
        expect(
            ['in_progress', 'in_review'].includes(claimed.status),
            `task status while clarifying left todo (got ${claimed.status})`
        ).toBe(true);
        expect(claimed.assigneeAgentId, 'task assignee while clarifying').toBe(worker.id);

        const questions = await inChannel(clarifying);
        expect(questions.length > 0, 'the Agent asked inline in the channel').toBe(true);
        expect(
            Date.parse(claimed.claimedAt ?? '') <= Date.parse(questions[0].createdAt),
            'the task was claimed no later than its first channel message'
        ).toBe(true);
        expect(
            await clarifying.authoredMessagesIn(created.threadChatId),
            'questions in the task Thread'
        ).toHaveLength(0);

        log('answering the question inline');
        const question = questions.at(-1);
        await kit.trpc('chat.send', {
            attachmentIds: [],
            chatId: channel.id,
            content: `Target independent bookstore owners. Include the exact marker ${token} in the blurb.`,
            nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
            replyToMessageId: question.id,
            serverId: kit.serverId,
        });

        const delivering = await settleTurn(worker.id);
        expect(delivering.status, 'delivery turn status').toBe('completed');
        expect(delivering.failureKind ?? 'none', 'delivery turn failure kind').toBe('none');
        expect(delivering.outputProduced, 'delivery turn produced durable output').toBe(true);

        log('checking delivery gates');
        const drafts = await inChannel(delivering);
        expect(
            drafts.some((message) => message.content.includes(token)),
            `a channel draft after the answer carries the marker ${token}`
        ).toBe(true);
        expect(
            await delivering.authoredMessagesIn(created.threadChatId),
            'drafts in the task Thread'
        ).toHaveLength(0);

        const reviewed = await kit.readTask(created.messageId);
        expect(reviewed.status, 'task status after delivery').toBe('in_review');
        expect(reviewed.assigneeAgentId, 'task assignee after delivery').toBe(worker.id);
    },
});
