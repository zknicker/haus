// Shared run for the thread-claim scenarios: a human asks for tool-using work
// inside a Thread of a Channel or DM, and the Agent claims that Thread message
// as a task where it sits, answering in the Thread (ADR 0015, 2026-11-02
// amendment). The request's instructions are sealed so the Agent must run a
// shell command before it can answer, which makes the claim rule apply.

import { gzipSync } from 'node:zlib';

import { isThreadTarget, journalCommands, parseDoneSends } from './placement.mjs';

const workStatuses = ['in_progress', 'in_review', 'done'];

/** A one-step sealed shell puzzle whose answer only a tool call reveals. */
export function sealedPuzzle({ divisor, limit, modulus }) {
    let sum = 0;
    for (let value = divisor; value <= limit; value += divisor) {
        sum += value;
    }
    const text = `Sum every integer from 1 to ${limit} that is divisible by ${divisor}, then take that sum mod ${modulus}. Report only that final number.`;
    const blob = gzipSync(Buffer.from(text)).toString('base64');
    return { answer: String(sum % modulus), command: `echo ${blob} | base64 -d | gunzip` };
}

/**
 * Sends the Thread request, settles its turn, and gates the claim and answer.
 * `parentChatId` is the Channel or DM; `anchorMessageId` a top-level message there.
 */
export async function runThreadClaim(
    { agents, expect, kit, log, marker, settleTurn },
    { anchorMessageId, parentChatId, puzzle }
) {
    const [worker] = agents;
    const token = marker('THREAD');

    log('asking in the Thread');
    const request = await kit.sendInThread(
        parentChatId,
        anchorMessageId,
        `@${worker.handle} Can you work this out in your shell? Unpack the instructions with \`${puzzle.command}\`, then give me the number with the exact marker ${token}.`
    );
    const threadChatId = request.threadChatId;
    expect(threadChatId, 'Thread chat id on the send receipt').toBeTruthy();

    const turn = await settleTurn(worker.id);
    expect(turn.status, 'turn status').toBe('completed');
    expect(turn.failureKind ?? 'none', 'turn failure kind').toBe('none');
    expect(turn.outputProduced, 'turn produced durable output').toBe(true);

    log('checking the claim');
    // An Agent's claim is background tier, which the default list hides.
    const { tasks } = await kit.trpc('task.list', {
        chatId: parentChatId,
        includeBackground: true,
        serverId: kit.serverId,
    });
    const parentTasks = tasks
        .map((entry) => entry.task)
        .filter((task) => task.chatId === parentChatId);
    log(
        `parent tasks: ${parentTasks.map((task) => `#${task.number} ${task.messageId} thread=${task.threadChatId}`).join('; ') || 'none'}`
    );
    const claimed = parentTasks.find((task) => task.messageId === request.message.id);
    expect(Boolean(claimed), 'the Thread request became a task').toBe(true);
    expect(claimed.threadChatId, 'task thread_chat_id is the request Thread').toBe(threadChatId);
    expect(claimed.assigneeAgentId, 'task assignee').toBe(worker.id);
    expect(
        workStatuses.includes(claimed.status),
        `task status left todo (got ${claimed.status})`
    ).toBe(true);

    const others = parentTasks.filter((task) => task.messageId !== request.message.id);
    // A task's title is its message. Checked before the extra-task gate so a failure
    // names the regression the 2026-11-02 change fixed (`dm:@user:<ids>` titles).
    const otherIds = new Set(others.map((task) => task.messageId));
    const titles = (await kit.readMessages(parentChatId))
        .filter((message) => otherIds.has(message.id))
        .map((message) => message.content);
    expect(
        titles.filter((title) => routingIdPattern.test(title)),
        'task titles carrying a target or message id'
    ).toHaveLength(0);
    expect(
        others.map((task) => `#${task.number} ${task.messageId}`),
        'other tasks in the parent'
    ).toHaveLength(0);
    const parentPosts = (await turn.authoredMessagesIn(parentChatId)).filter(
        (message) => message.chatId === parentChatId
    );
    expect(
        parentPosts.map((message) => message.content.slice(0, 80)),
        'top-level posts in the parent'
    ).toHaveLength(0);

    log('checking the answer');
    const threadPosts = (await turn.authoredMessagesIn(threadChatId)).filter(
        (message) => message.chatId === threadChatId
    );
    const answer = threadPosts.find((message) => message.content.includes(token));
    expect(Boolean(answer), `a Thread reply carries the marker ${token}`).toBe(true);
    const result = new RegExp(`(?<![\\d.])${puzzle.answer}(?![\\d.])`, 'u');
    expect(result.test(answer.content.replace(token, '')), `computed result ${puzzle.answer}`).toBe(
        true
    );
    expect(
        Date.parse(claimed.claimedAt ?? '') <= Date.parse(answer.createdAt),
        'claim happened before the answer'
    ).toBe(true);

    const commands = await journalCommands(kit, worker.id, turn);
    const doneSends = parseDoneSends(commands);
    log(
        `--done sends: ${doneSends.map((send) => `${send.target} reply-to=${send.replyTo || 'none'}`).join('; ') || 'none seen'}`
    );
    expect(doneSends.length >= 1, '--done send found in the turn journal').toBe(true);
    expect(
        doneSends.filter((send) => !isThreadTarget(send.target)).map((send) => send.target),
        '--done sends outside a Thread'
    ).toHaveLength(0);
    expect(
        doneSends.filter((send) => send.replyTo !== '').map((send) => send.replyTo),
        '--done sends with --reply-to'
    ).toHaveLength(0);
}

// A chat target (`#name`, `#name:shortid`, `dm:@peer`) or a message id.
const routingIdPattern = /dm:@|#[\w-]+:\w{6,}|\bmsg_\w+/u;
