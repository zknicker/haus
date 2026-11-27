import { sleep } from '../eval-harness.mjs';
import { openStackDatabase } from './computer-world.mjs';
import { waitForQuiet } from './quiet.mjs';

const quietPollMs = 2000;

export function openCrewLedger() {
    const sql = openStackDatabase();

    async function postsBy(agentId, { runIds = null, since = null } = {}) {
        const rows = await sql`
            select m.id, m.chat_id, m.content, m.created_at, m.run_id, c.kind
            from chat_messages m
            join chats c on c.server_id = m.server_id and c.id = m.chat_id
            where m.author_agent_id = ${agentId}
            order by m.created_at, m.sequence
        `;
        return rows
            .map((row) => ({
                chatId: row.chat_id,
                chatKind: row.kind,
                content: row.content,
                createdAt: new Date(row.created_at).toISOString(),
                id: row.id,
                runId: row.run_id,
            }))
            .filter((post) => runIds === null || runIds.includes(post.runId))
            .filter((post) => since === null || Date.parse(post.createdAt) >= Date.parse(since));
    }

    async function finishes(captainId, taskShortId) {
        const rows = await sql`
            select content, created_at from agent_inbox
            where agent_id = ${captainId} and source = 'crew_finish'
            order by created_at
        `;
        return rows
            .map((row) => ({
                ...JSON.parse(row.content),
                createdAt: new Date(row.created_at).toISOString(),
            }))
            .filter((finish) => finish.taskShortId === taskShortId);
    }

    return { close: () => sql.close(), finishes, postsBy };
}

export async function awaitQuiet(kit, agentId, { within = 120_000 } = {}) {
    await waitForQuiet(() => kit.turns.deliveryState(agentId), {
        label: `Agent ${agentId}`,
        within,
    });
}

export async function turnsSince(kit, agentId, since, { within = 600_000 } = {}) {
    const deadline = Date.now() + within;
    while (Date.now() < deadline) {
        const turns = (await kit.turns.listTurns(agentId)).filter(
            (turn) => Date.parse(turn.startedAt) >= Date.parse(since)
        );
        if (turns.length > 0) {
            await awaitQuiet(kit, agentId, { within: Math.max(deadline - Date.now(), 1) });
            return (await kit.turns.listTurns(agentId)).filter(
                (turn) => Date.parse(turn.startedAt) >= Date.parse(since)
            );
        }
        await sleep(quietPollMs);
    }
    throw new Error(
        `Agent ${agentId} started no turn after ${since} within ${Math.round(within / 1000)}s.`
    );
}

export async function crewStartedBy(kit, agentId, since) {
    const lists = await Promise.all(
        [false, true].map((archived) => kit.trpc('task.list', { archived, serverId: kit.serverId }))
    );
    return lists
        .flat()
        .filter(
            (task) =>
                task.createdBy.kind === 'agent' &&
                task.createdBy.agentId === agentId &&
                Date.parse(task.createdAt) >= Date.parse(since)
        );
}

export function postsOutside(posts, chatIds) {
    return posts
        .filter((post) => !chatIds.includes(post.chatId))
        .map((post) => `${post.chatKind} ${post.chatId}: ${post.content.slice(0, 80)}`);
}

export async function useAgentMachineForTasks(kit, { agent, projectId }) {
    await kit.trpc('project.setDefaultMachine', {
        computerId: agent.computerId,
        projectId,
        serverId: kit.serverId,
    });
}
