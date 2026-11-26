import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import type { HausServerHarness } from './haus-server-harness.ts';

const crockford = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * One Task with its hidden `task` agent, as a start writes it (ADR 0062). Seed it beside the
 * Captains a roster, picker or access list reads, so the test proves the Task agent stays out.
 */
export async function seedTaskAgent(
    harness: Pick<HausServerHarness, 'sql'>,
    input: {
        captainId?: string;
        computerId: string;
        projectId: string;
        serverId: string;
        starterUserId?: string;
    }
) {
    const shortId = Array.from(
        { length: 8 },
        () => crockford[Math.floor(Math.random() * crockford.length)]
    ).join('');
    const seeded = {
        agentId: createOpaqueId('agt'),
        chatId: createOpaqueId('cht'),
        handle: `task-${shortId}`,
        shortId,
        taskId: createOpaqueId('tsk'),
    };
    const starter = input.captainId
        ? { agent: input.captainId, user: null }
        : { agent: null, user: input.starterUserId ?? null };
    await harness.sql`
        insert into agents (id, server_id, kind, handle, display_name, home_timezone, computer_id,
            desired_runtime_id, desired_model_id, created_by_agent_id, created_by_user_id)
        values (${seeded.agentId}, ${input.serverId}, 'task', ${seeded.handle}, 'Seeded Task', 'UTC',
            ${input.computerId}, 'codex', 'gpt-5.6-sol', ${starter.agent}, ${starter.user})
    `;
    await harness.sql`
        insert into chats (id, server_id, kind, parent_chat_id, parent_chat_kind)
        values (${seeded.chatId}, ${input.serverId}, 'task', ${input.projectId}, 'channel')
    `;
    await harness.sql`
        insert into tasks (id, server_id, short_id, title, chat_id, project_id, agent_id,
            captain_id, computer_id, model, created_by_agent_id, created_by_user_id)
        values (${seeded.taskId}, ${input.serverId}, ${shortId}, 'Seeded Task', ${seeded.chatId},
            ${input.projectId}, ${seeded.agentId}, ${input.captainId ?? null}, ${input.computerId},
            'gpt-5.6-sol', ${starter.agent}, ${starter.user})
    `;
    return seeded;
}
