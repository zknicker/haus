// Evidence for Task pacing (ADR 0052, operator decision 2026-11-18): an Agent works Tasks others
// assign it one at a time, by priority then age, setting the one it takes `open` and leaving the
// rest `todo`; Tasks it started itself may run side by side. The Server keeps where each Task
// ended up, not the order it got there, so the order comes from the execution journal.
//
// Assigned Tasks are seeded the way they reach an Agent in the product: a lead Agent starts them
// in `todo` from a person's channel message, and the person assigns them to the worker, so the
// assignment input names that person as the assigner.

import { createAgentAuthor } from './author.mjs';

/** Starts a Task as `agentId` from `messageId` in `channel`, assigned to that Agent. */
export async function startTaskAsAgent(kit, { agentId, channel, messageId, ...fields }) {
    const author = createAgentAuthor({
        serverId: kit.serverId,
        serverUrl: kit.harness.serverUrl,
        stamp: kit.stamp,
    });
    const token = await author.mint(agentId, channel.id);
    const response = await fetch(`${kit.harness.serverUrl}/api/agent/tasks/start`, {
        body: JSON.stringify({
            from: messageId,
            state: 'todo',
            target: `#${channel.name}`,
            ...fields,
        }),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const payload = await response.json().catch(() => null);
    if (!(response.ok && payload?.task?.id)) {
        throw new Error(
            `Agent Task start failed (${response.status}): ${JSON.stringify(payload)?.slice(0, 300)}`
        );
    }
    return payload.task;
}

/** The evaluating person assigns the Task to `agentId`, as the Tasks page does. */
export async function assignAsPerson(kit, task, agentId) {
    const { task: assigned } = await kit.trpc('task.assign', {
        assignee: { agentId, kind: 'agent' },
        expectedVersion: task.version,
        serverId: kit.serverId,
        taskId: task.id,
    });
    return assigned;
}

/** The Agent's completed tool calls across a settled turn's runs, oldest first. */
export async function journalTools(kit, agentId, turn, { attempts = 10, delayMs = 3000 } = {}) {
    const tools = [];
    for (const runId of turn.runIds ?? [turn.runId]) {
        let result = null;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            result = await kit.trpc('agent.executionJournal', {
                agentId,
                runId,
                serverId: kit.serverId,
            });
            if (result.status === 'available') {
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        if (result?.status !== 'available') {
            throw new Error(
                `Execution journal for run ${runId} stayed ${result?.status ?? 'unreadable'}; the pacing evidence is unavailable.`
            );
        }
        tools.push(...result.journal.tools.filter((tool) => tool.status === 'completed'));
    }
    return tools.sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
}

/**
 * The state changes in order, one `{ key, state }` per completed `haus task state <KEY> <state>`,
 * plus `{ kind: 'start-todo' }` for each `haus task start` that parked its Task in `todo`. A
 * refused command changed nothing, so only completed calls count.
 */
export function stateSteps(tools) {
    return tools.flatMap((tool) => {
        const command = String(tool.input?.command ?? '');
        const changes = [...command.matchAll(/\bhaus task state\s+([^\n;&|]*)/gu)].flatMap(
            ([, rest]) => {
                const match = /\b([A-Z][A-Z0-9]{1,4}-[1-9]\d*)\s+(todo|open|done|canceled)\b/u.exec(
                    rest
                );
                return match ? [{ key: match[1], kind: 'state', state: match[2] }] : [];
            }
        );
        const parked = [...command.matchAll(/\bhaus task start\b[^\n;&|]*/gu)]
            .filter(([text]) => /--state[\s=]+["']?todo\b/u.test(text))
            .map(() => ({ kind: 'start-todo' }));
        return [...changes, ...parked];
    });
}

/**
 * What the steps prove for the Tasks in `keys`: the most open at once, the order they were
 * opened and finished, which finished without being opened, and how often each was opened.
 */
export function paceOf(steps, keys) {
    const tracked = new Set(keys);
    const open = new Set();
    const opened = [];
    const finished = [];
    const skippedOpen = [];
    let mostOpen = 0;
    for (const step of steps) {
        if (step.kind !== 'state' || !tracked.has(step.key)) {
            continue;
        }
        if (step.state === 'open') {
            open.add(step.key);
            opened.push(step.key);
            mostOpen = Math.max(mostOpen, open.size);
        } else if (step.state === 'done') {
            if (!open.delete(step.key)) {
                skippedOpen.push(step.key);
            }
            finished.push(step.key);
        } else {
            open.delete(step.key);
        }
    }
    const timesOpened = (key) => opened.filter((entry) => entry === key).length;
    return { finished, mostOpen, opened, skippedOpen, timesOpened };
}

/** Tasks have no deletion; canceling keeps these out of later lists and queues. Best effort. */
export async function cancelTasks(kit, tasks) {
    for (const task of tasks) {
        const current = await kit
            .trpc('task.get', { serverId: kit.serverId, taskId: task.id })
            .catch(() => null);
        if (current && current.state !== 'canceled') {
            await kit
                .trpc('task.setState', {
                    expectedVersion: current.version,
                    serverId: kit.serverId,
                    state: 'canceled',
                    taskId: task.id,
                })
                .catch(() => undefined);
        }
    }
}

export async function stopAgent(kit, agentId) {
    await kit.trpc('agent.stop', { agentId, serverId: kit.serverId });
}

export async function startAgent(kit, agentId) {
    await kit.trpc('agent.start', { agentId, serverId: kit.serverId });
}
