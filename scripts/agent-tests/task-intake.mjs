// Shared evidence for the task-intake scenarios: whether an Agent turned work into a Task or
// just replied. The rule under test: an Agent creates a Task when its reply will not be the
// whole of the work (more steps, more time, or a cloud agent), and otherwise just replies; a
// claim, not a Task, marks who owns a message. The source of the work does not change that.
//
// A Task is a place (ADR 0053): its `origin` names the Channel Message it started from, its
// `chatId` is its own conversation, where work done for it is reported, and cloud work
// launched for it is listed in the Task's `attachedWork`.

import { gzipSync } from 'node:zlib';

const ownBy = (agentId) => (message) =>
    message.author.kind === 'agent' && message.author.agentId === agentId;

/** Tasks `agentId` created at or after `since` (ISO), across the Server. */
export async function tasksCreatedBy(kit, agentId, since = '1970-01-01T00:00:00.000Z') {
    const tasks = await kit.trpc('task.list', { serverId: kit.serverId });
    return tasks.filter(
        (task) =>
            task.createdBy.kind === 'agent' &&
            task.createdBy.agentId === agentId &&
            Date.parse(task.createdAt) >= Date.parse(since)
    );
}

/** The Task with its attached work and Mentioned in. */
export function readTaskDetail(kit, task) {
    return kit.trpc('task.get', { serverId: kit.serverId, taskId: task.id });
}

/** Whether a message references the Task, as a resolved link or its bare key. */
export function referencesTask(message, task) {
    return (
        (message.taskLinks ?? []).some((link) => link.taskId === task.id) ||
        String(message.content ?? '').includes(task.key)
    );
}

/**
 * Posts that repeat the Task's result outside the Task. The channel already previews the Task
 * under its origin with its state and latest line, so a post there may name the Task but never
 * carry the result, the computed `answer` as a standalone number. The run's marker is not
 * checked: an origin message may restate the request, marker and all. The Task's own key is
 * ignored, so `SEC-12` never reads as the answer 12.
 */
export function resultCopies(posts, task, answer) {
    const standalone = new RegExp(`(?<![\\w-])${answer}(?![\\w-])`, 'u');
    return posts.filter((message) =>
        standalone.test(String(message.content ?? '').replaceAll(task.key, ''))
    );
}

/**
 * The Task's origin Message, read from its `origin` field, when it is in `chatId` and authored
 * by `agentId` (or by anyone when `agentId` is null). Null when the Task started elsewhere.
 */
export async function originMessage(kit, task, { agentId, chatId }) {
    if (task.origin?.chatId !== chatId) {
        return null;
    }
    const message = (await kit.readMessages(chatId)).find(
        (entry) => entry.id === task.origin.messageId
    );
    if (!message || (agentId !== null && !ownBy(agentId)(message))) {
        return null;
    }
    return message;
}

/** What `agentId` posted in the Task's own conversation, oldest first. */
export async function taskPosts(kit, task, agentId) {
    if (!task.chatId) {
        return [];
    }
    await kit.trackChat(task.chatId);
    return (await kit.readMessages(task.chatId))
        .filter(ownBy(agentId))
        .sort((left, right) => left.sequence - right.sequence);
}

/** Cloud work attached to the Task (its `task_id`), newest first. */
export async function attachedWork(kit, task) {
    return (await readTaskDetail(kit, task)).attachedWork ?? [];
}

/** Every post `agentId` made in a chat after `head`, top level and inline. */
export async function postsAcross(kit, chatId, agentId, head = 0) {
    const own = ownBy(agentId);
    return (await kit.readMessages(chatId)).filter(
        (message) => own(message) && message.sequence > head
    );
}

/** The claim the Server holds on a message, read off the message itself. */
export async function claimOn(kit, chatId, messageId) {
    const message = (await kit.readMessages(chatId)).find((entry) => entry.id === messageId);
    return message?.claim ?? null;
}

/**
 * Work that is several steps by construction: each step is sealed inside the one before, so
 * it cannot collapse into one command or one reply. Returns the first unpack command and the
 * number the last step yields.
 */
export function relayPuzzle({ divisor, limit, modulus }) {
    let count = 0;
    let sum = 0;
    for (let value = divisor; value <= limit; value += divisor) {
        count += 1;
        sum += value;
    }
    const seal = (text) => gzipSync(Buffer.from(text)).toString('base64');
    const unpack = (blob) => `echo ${blob} | base64 -d | gunzip`;
    const step4 = seal(`Step 4 of 4: take your step 3 sum mod ${modulus}. That is the result.`);
    const step3 = seal(
        `Step 3 of 4: sum the ${count} multiples of ${divisor} you found. Then unpack step 4: ${unpack(step4)}`
    );
    const step2 = seal(
        `Step 2 of 4: list the numbers in that file divisible by ${divisor}. Then unpack step 3: ${unpack(step3)}`
    );
    const step1 = seal(
        `Step 1 of 4: write the numbers 1 to ${limit}, one per line, to a file in your workspace. Then unpack step 2: ${unpack(step2)}`
    );
    return { answer: String(sum % modulus), command: unpack(step1) };
}

/**
 * Cancels every Task these Agents created, so a later run's lists and sidebars stay clean.
 * Tasks have no deletion; `canceled` is the closest thing. Best effort.
 */
export async function cancelTasksBy(kit, agentIds) {
    for (const agentId of agentIds) {
        const tasks = await tasksCreatedBy(kit, agentId).catch(() => []);
        for (const task of tasks.filter((entry) => entry.state !== 'canceled')) {
            await kit
                .trpc('task.setState', {
                    expectedVersion: task.version,
                    serverId: kit.serverId,
                    state: 'canceled',
                    taskId: task.id,
                })
                .catch(() => undefined);
        }
    }
}

export function expectSettled(expect, turn, label) {
    expect(turn.status, `${label} status`).toBe('completed');
    expect(turn.failureKind ?? 'none', `${label} failure kind`).toBe('none');
}

/** Settles an addressed-anyway turn (an FYI in a one-Agent channel) when one started. */
export async function settleIfStarted(settleTurn, agentId) {
    await settleTurn(agentId).catch((error) => {
        if (!/no turn started/u.test(String(error))) {
            throw error;
        }
    });
}
