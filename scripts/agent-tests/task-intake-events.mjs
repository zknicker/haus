// Event sources for the task-intake scenarios: a Reminder the Agent owns, fired now through
// the dev-only `dev.fireReminderNow` route, and a GitHub `workflow_run` Trigger fired by a
// signed delivery on the seeded `acme` installation (github-world.mjs). Both seed through the
// same Agent routes the CLI uses, so the Agent meets an ordinary fire.

import { createAgentAuthor } from './author.mjs';
import { createAgentGithubTrigger, seedGithubWorld } from './github-world.mjs';

/**
 * Schedules a one-shot Reminder owned by `agentId`, anchored on `messageId`, an hour out, as
 * `haus reminder schedule` would. The scenario fires it with `fireReminderNow`.
 */
export async function scheduleAgentReminder(
    kit,
    { agentId, chatId, description, messageId, title }
) {
    const author = createAgentAuthor({
        serverId: kit.serverId,
        serverUrl: kit.harness.serverUrl,
        stamp: kit.stamp,
    });
    const token = await author.mint(agentId, chatId);
    const response = await fetch(`${kit.harness.serverUrl}/api/agent/reminders/schedule`, {
        body: JSON.stringify({
            commandId: `agent-tests-${kit.stamp}-${crypto.randomUUID()}`,
            description,
            fireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            messageId,
            title,
        }),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const payload = await response.json().catch(() => null);
    if (!(response.ok && payload?.reminder?.id)) {
        throw new Error(
            `Agent Reminder schedule failed (${response.status}): ${JSON.stringify(payload)?.slice(0, 300)}`
        );
    }
    return payload.reminder;
}

/** Fires the Reminder now and settles the fire turn. Returns the turn and the fire id. */
export async function fireReminderNow(kit, { agentId, reminder, settleTurn }) {
    const settling = settleTurn(agentId, { startWithin: 90_000 });
    await kit.trpc('dev.fireReminderNow', { reminderId: reminder.id, serverId: kit.serverId });
    const turn = await settling;
    const runs = await kit.trpc('reminder.runs', {
        reminderId: reminder.id,
        serverId: kit.serverId,
    });
    return { fireId: runs[0]?.id ?? null, turn };
}

export async function cancelReminder(kit, reminder, agentId) {
    if (!reminder) {
        return;
    }
    const rows = await kit
        .trpc('reminder.list', { agentId, serverId: kit.serverId, status: 'scheduled' })
        .catch(() => []);
    const current = rows.find((row) => row.id === reminder.id);
    if (current) {
        await kit
            .trpc('reminder.cancel', {
                commandId: `agent-tests-cleanup-${kit.stamp}`,
                expectedVersion: current.version,
                reminderId: current.id,
                serverId: kit.serverId,
            })
            .catch(() => undefined);
    }
}

/**
 * Seeds the `acme` installation, anchors a `workflow_run` Trigger owned by the worker on a
 * plain FYI in `channel`, and returns `fire(conclusion, workflow)`, which posts a signed
 * delivery and settles the fire turn, plus `cleanup()`.
 */
export async function armWorkflowTrigger(kit, { channel, conclusion, instruction, title, worker }) {
    const world = await seedGithubWorld(kit, worker);
    try {
        const anchor = await kit.trpc('chat.send', {
            chatId: channel.id,
            content: `Release log ${kit.stamp}: CI on acme/api main reports here.`,
            nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
            serverId: kit.serverId,
        });
        await kit.harness.waitForAgentQuiet(worker.id, 10_000, 300_000);
        const created = await createAgentGithubTrigger(kit, {
            agentId: worker.id,
            chatId: channel.id,
            github: {
                events: [
                    {
                        actions: ['completed'],
                        branches: ['main'],
                        conclusions: [conclusion],
                        event: 'workflow_run',
                    },
                ],
                installationRowId: world.installationRowId,
                repositories: { scope: 'installation' },
            },
            instruction,
            messageId: anchor.message.id,
            title,
        });
        const triggerId = created?.trigger?.id;
        if (!triggerId) {
            throw new Error('The workflow_run Trigger was not created.');
        }
        return {
            cleanup: () => disarm(kit, world, worker.id),
            fire: async (settleTurn, workflow) => {
                const settling = settleTurn(worker.id, { startWithin: 60_000 });
                await new Promise((resolve) => setTimeout(resolve, 1000));
                const delivery = await world.postDelivery(
                    'workflow_run',
                    workflowRun(world, { conclusion, name: workflow })
                );
                const turn = await settling;
                const fires = await kit.trpc('trigger.runs', { serverId: kit.serverId, triggerId });
                return { delivery, fireId: fires[0]?.id ?? null, fires, turn };
            },
            triggerId,
        };
    } catch (error) {
        await disarm(kit, world, worker.id);
        throw error;
    }
}

async function disarm(kit, world, agentId) {
    const owned = await kit
        .trpc('trigger.list', { agentId, serverId: kit.serverId })
        .catch(() => []);
    for (const entry of owned) {
        await kit
            .trpc('trigger.delete', { serverId: kit.serverId, triggerId: entry.id })
            .catch(() => undefined);
    }
    await world.cleanup();
}

/** A completed run on main, shaped like GitHub's `workflow_run` payload. */
function workflowRun(world, { conclusion, name }) {
    const path = `.github/workflows/${name.toLowerCase().replaceAll(' ', '-')}.yml`;
    const sha = 'acb5820ced9479c074f688cc328bf03f341a511d';
    return {
        action: 'completed',
        workflow: { id: 161_335, name, path },
        workflow_run: {
            check_suite_id: 42,
            conclusion,
            display_title: 'Bump the release version',
            event: 'push',
            head_branch: 'main',
            head_commit: { id: sha, message: 'Bump the release version' },
            head_sha: sha,
            html_url: `${world.repository.html_url}/actions/runs/30433642`,
            id: 30_433_642,
            name,
            path,
            pull_requests: [],
            run_attempt: 1,
            run_number: 562,
            status: 'completed',
            workflow_id: 161_335,
        },
    };
}
