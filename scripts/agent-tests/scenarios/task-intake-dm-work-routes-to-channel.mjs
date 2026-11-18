// Task intake 12: a human asks for multi-step work in a DM, and the work belongs to a
// channel. The Agent posts the origin message in that channel, @mentioning the requester,
// starts the Task from it, replies in the DM with the Task reference, and reports the work in
// the Task. No Task starts in a DM (the Server refuses with `TASK_ORIGIN_DM`).

import { humanAuthorId, mentionsHuman } from '../human-addressing.mjs';
import { withRoutingEvidence } from '../routing-evidence.mjs';
import { defineScenario } from '../scenario.mjs';
import {
    cancelTasksBy,
    expectSettled,
    originMessage,
    postsAcross,
    referencesTask,
    relayPuzzle,
    resultCopies,
    settleIfStarted,
    taskPosts,
    tasksCreatedBy,
} from '../task-intake.mjs';

const puzzle = relayPuzzle({ divisor: 13, limit: 520, modulus: 89 });

export default defineScenario({
    agents: [{ kind: 'worker' }],
    contract:
        'Multi-step work asked in a DM that belongs to a channel becomes one Task started from a top-level Agent message in that channel that @mentions the requester; the DM gets a reply carrying the Task reference, and the work is reported in the Task, with no copy of the result in the DM or the channel.',
    name: 'task-intake-dm-work-routes-to-channel',
    run: withRoutingEvidence(async ({ agents, expect, kit, log, marker, settleTurn }) => {
        const [worker] = agents;
        const dmChatId = worker.dmChatId;
        if (!dmChatId) {
            throw new Error(`Agent @${worker.handle} has no Owner DM to send into.`);
        }
        const token = marker('LEDGER');
        const channel = await kit.createChannel({ agentIds: [worker.id] });

        try {
            await kit.harness.send(
                channel.id,
                `FYI, no reply needed. #${channel.name} is where the finance ledger checks for ${kit.stamp} live.`
            );
            await settleIfStarted(settleTurn, worker.id);
            const channelHead = await kit.readHead(channel.id);
            const dmHead = await kit.readHead(dmChatId);

            log('asking in the DM');
            const request = await kit.harness.send(
                dmChatId,
                `The finance ledger check in #${channel.name} looks off. Can you dig in and fix it? It is a four-step relay, each step sealed in the one before; start with \`${puzzle.command}\` and report the final number with the marker ${token}.`
            );
            const requester = humanAuthorId(request.message);
            const turn = await settleTurn(worker.id);
            expectSettled(expect, turn, 'turn');

            log('checking gates');
            const tasks = await tasksCreatedBy(kit, worker.id, turn.startedAt);
            expect(tasks, 'Tasks the Agent created').toHaveLength(1);
            const [task] = tasks;
            const origin = await originMessage(kit, task, {
                agentId: worker.id,
                chatId: channel.id,
            });
            expect(Boolean(origin), "the Task's origin is an Agent message in the channel").toBe(
                true
            );
            expect(origin.reply ?? null, 'the origin is a top-level message').toBe(null);
            expect(origin.sequence > channelHead, 'the origin was posted for this request').toBe(
                true
            );
            expect(
                mentionsHuman(origin.content, requester),
                'the origin @mentions the requester'
            ).toBe(true);

            const dmPosts = await postsAcross(kit, dmChatId, worker.id, dmHead);
            expect(
                dmPosts.filter(
                    (message) => message.chatId === dmChatId && referencesTask(message, task)
                ).length >= 1,
                'the DM reply carries the Task reference'
            ).toBe(true);
            expect(
                dmPosts.filter((message) => message.content.includes(token)),
                'work results posted in the DM'
            ).toHaveLength(0);
            expect(
                resultCopies(
                    [...dmPosts, ...(await postsAcross(kit, channel.id, worker.id, channelHead))],
                    task,
                    puzzle.answer
                ),
                'DM or channel posts repeating the result the Task reports'
            ).toHaveLength(0);
            expect(
                (await taskPosts(kit, task, worker.id)).some((message) =>
                    message.content.includes(puzzle.answer)
                ),
                'the result is reported in the Task'
            ).toBe(true);
        } finally {
            await cancelTasksBy(kit, [worker.id]);
        }
    }),
});
