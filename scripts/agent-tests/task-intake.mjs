import { gzipSync } from 'node:zlib';

const ownBy = (agentId) => (message) =>
    message.author.kind === 'agent' && message.author.agentId === agentId;

export async function tasksCreatedBy(kit, agentId, since = '1970-01-01T00:00:00.000Z') {
    const tasks = await kit.trpc('task.list', { serverId: kit.serverId });
    return tasks.filter(
        (task) =>
            task.createdBy.kind === 'agent' &&
            task.createdBy.agentId === agentId &&
            Date.parse(task.createdAt) >= Date.parse(since)
    );
}

export function readTaskDetail(kit, task) {
    return kit.trpc('task.get', { serverId: kit.serverId, taskId: task.id });
}

export function referencesTask(message, task) {
    return (
        (message.taskLinks ?? []).some((link) => link.taskId === task.id) ||
        String(message.content ?? '').includes(task.key)
    );
}

export function resultCopies(posts, task, answer) {
    const standalone = new RegExp(`(?<![\\w-])${answer}(?![\\w-])`, 'u');
    return posts.filter((message) =>
        standalone.test(String(message.content ?? '').replaceAll(task.key, ''))
    );
}

export function channelFootprint(posts, task, { answer = null } = {}) {
    const references = posts.filter((message) => referencesTask(message, task));
    return {
        copies: answer === null ? [] : resultCopies(posts, task, answer),
        multiline: posts.filter((message) =>
            String(message.content ?? '')
                .trim()
                .includes('\n')
        ),
        others: posts.filter((message) => !referencesTask(message, task)),
        references,
    };
}

export function expectShortFootprint(
    expect,
    footprint,
    { acknowledgments = 1, references = [0, 1] } = {}
) {
    const [fewest, most] = references;
    const count = footprint.references.length;
    expect(
        count >= fewest && count <= most,
        `channel posts referencing the Task (${count}, allowed ${fewest} to ${most})`
    ).toBe(true);
    expect(
        footprint.others.length <= acknowledgments,
        `channel posts besides the Task reference (${footprint.others.length}, allowed ${acknowledgments})`
    ).toBe(true);
    expect(footprint.multiline, 'channel posts longer than one brief line').toHaveLength(0);
    expect(footprint.copies, 'channel posts repeating the result the Task reports').toHaveLength(0);
}

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

export async function taskPosts(kit, task, agentId) {
    if (!task.chatId) {
        return [];
    }
    await kit.trackChat(task.chatId);
    return (await kit.readMessages(task.chatId))
        .filter(ownBy(agentId))
        .sort((left, right) => left.sequence - right.sequence);
}

export async function attachedWork(kit, task) {
    return (await readTaskDetail(kit, task)).attachedWork ?? [];
}

export async function postsAcross(kit, chatId, agentId, head = 0) {
    const own = ownBy(agentId);
    return (await kit.readMessages(chatId)).filter(
        (message) => own(message) && message.sequence > head
    );
}

export async function claimOn(kit, chatId, messageId) {
    const message = (await kit.readMessages(chatId)).find((entry) => entry.id === messageId);
    return message?.claim ?? null;
}

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

export async function settleIfStarted(settleTurn, agentId) {
    await settleTurn(agentId).catch((error) => {
        if (!/no turn started/u.test(String(error))) {
            throw error;
        }
    });
}
