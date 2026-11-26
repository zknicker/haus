import { beforeAll } from 'bun:test';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createTestProject } from './project.fixture.ts';
import { startTestTask, type TestTask } from './task-place-fixture.ts';

export function agentHearingFixture() {
    const fixture = agentCreationFixture();
    const agents: Record<string, string> = {};
    const projects: Record<string, { id: string; key: string }> = {};
    let hausId = '';

    beforeAll(async () => {
        for (const handle of ['ari', 'cyl', 'bex', 'dov', 'gus']) {
            agents[handle] = await fixture.createAgent(handle, handle);
        }
        for (const [name, key, homed] of [
            ['web', 'WEB', ['ari', 'cyl']],
            ['api', 'API', ['bex', 'dov']],
            ['empty', 'EMPTY', []],
        ] as const) {
            const chat = await createTestProject(fixture.owner, {
                agentIds: homed.map((handle) => agents[handle] ?? ''),
                key,
                name,
                serverId: fixture.serverId,
            });
            projects[name] = { id: chat.id, key };
        }
        const [haus] = (await fixture.harness.sql`
            select id from chats where server_id = ${fixture.serverId} and is_all
        `) as { id: string }[];
        hausId = haus?.id ?? '';
    });

    function project(name: string) {
        const found = projects[name];
        if (!found) {
            throw new Error(`No test Project ${name}.`);
        }
        return found.id;
    }

    async function send(chatId: string, content: string, replyToMessageId?: string) {
        const sent = await fixture.owner.trpc.chat.send.mutate({
            chatId,
            content,
            nonce: createOpaqueId('n'),
            replyToMessageId,
            serverId: fixture.serverId,
        });
        return sent.message.id;
    }

    async function startTask(name: string, title: string) {
        return await startTestTask(fixture.harness, fixture.owner, {
            channelId: project(name),
            serverId: fixture.serverId,
            title,
        });
    }

    async function unfollow(handle: string, task: TestTask) {
        const runner = await fixture.mintRunner(createOpaqueId('run'), agents[handle], task.chatId);
        return (
            await fixture.post('/api/agent/tasks/unfollow', runner, {
                target: `task:${task.shortId}`,
            })
        ).status;
    }

    async function heard(messageId: string) {
        const rows = (await fixture.harness.sql`
            select agent.handle from agent_inbox item
            join agents agent on agent.server_id = item.server_id and agent.id = item.agent_id
            where item.server_id = ${fixture.serverId} and item.dedupe_key = ${messageId}
            order by agent.handle
        `) as { handle: string }[];
        return rows.map((row) => row.handle);
    }

    return {
        agents,
        fixture,
        get hausId() {
            return hausId;
        },
        heard,
        project,
        send,
        startTask,
        unfollow,
    };
}
