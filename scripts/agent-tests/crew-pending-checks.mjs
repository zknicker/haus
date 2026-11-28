import { createAgentAuthor } from './author.mjs';
import { awaitQuiet, crewStartedBy, turnsSince, runTasksOnAgentMachine } from './crew.mjs';

const pendingChecksPullRequest = 'https://github.com/acme/web/pull/41';

export async function startPendingChecksCrew(kit, { captain, log }) {
    const project = await kit.createChannel({ agentIds: [captain.id] });
    await runTasksOnAgentMachine(kit, { agent: captain, projectId: project.id });
    await awaitQuiet(kit, captain.id);
    const { issue } = await kit.trpc('issue.create', {
        description:
            'Bump lodash from 4.17.20 to 4.17.21 in acme/web for the prototype-pollution advisory.',
        priority: 'high',
        projectId: project.id,
        serverId: kit.serverId,
        state: 'todo',
        title: 'Bump lodash to 4.17.21 in acme/web',
    });
    const since = new Date().toISOString();
    log(`starting crew on ${issue.code} as the Captain`);
    await startCrewAsCaptain(kit, captain, {
        brief: [
            `Bump lodash from 4.17.20 to 4.17.21 in acme/web (${issue.code}).`,
            `Where it stands: the change is committed and pushed as ${pendingChecksPullRequest}, head 3f9c2e1. This Machine has no GitHub access, so take CI from here: lint and unit passed; e2e, build and deploy-preview are still running.`,
            'Out of scope: any other dependency. Post where the work stands in your chat now; you need not wait for CI.',
        ].join('\n\n'),
        issue: issue.code,
        title: 'Bump lodash to 4.17.21',
    });
    const tasks = await crewStartedBy(kit, captain.id, since);
    if (tasks.length !== 1) {
        throw new Error(`Expected the one seeded crew Task, found ${tasks.length}.`);
    }
    const [task] = tasks;
    await kit.trackChat(task.chatId, { name: `task:${task.shortId}` });
    log(`waiting for Task ${task.shortId}`);
    await turnsSince(kit, task.agentId, task.createdAt);
    return { issue, project, task };
}

export function reportsChecksRunning(post) {
    return /\b(?:running|pending|in progress)\b/iu.test(post?.content ?? '');
}

async function startCrewAsCaptain(kit, captain, fields) {
    const author = createAgentAuthor({
        serverId: kit.serverId,
        serverUrl: kit.harness.serverUrl,
        stamp: kit.stamp,
    });
    const token = await author.mint(captain.id, captain.ownChatId);
    const response = await fetch(`${kit.harness.serverUrl}/api/agent/tasks/start`, {
        body: JSON.stringify(fields),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const payload = await response.json().catch(() => null);
    if (!(response.ok && payload?.state === 'started')) {
        throw new Error(
            `Crew start as the Captain failed (${response.status}): ${JSON.stringify(payload)?.slice(0, 300)}`
        );
    }
    return payload;
}
