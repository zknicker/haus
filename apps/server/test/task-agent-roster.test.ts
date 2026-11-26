import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { seedTaskAgent } from './task-agent.fixture.ts';

const fixture = agentCreationFixture();
let runner: { token: string };
let taskAgent: Awaited<ReturnType<typeof seedTaskAgent>>;

async function agentGet(path: string) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        headers: { authorization: `Bearer ${runner.token}` },
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

beforeAll(async () => {
    taskAgent = await seedTaskAgent(fixture.harness, {
        captainId: fixture.orbitAgentId,
        computerId: fixture.computerId,
        projectId: fixture.channelId,
        serverId: fixture.serverId,
    });
    runner = await fixture.mintRunner('run_task_agent_roster');
});

test('the App’s Captain list leaves the Task agent out', async () => {
    const agents = await fixture.owner.trpc.agent.list.query({ serverId: fixture.serverId });
    expect(agents.map((agent) => agent.id)).toContain(fixture.orbitAgentId);
    expect(agents.map((agent) => agent.id)).not.toContain(taskAgent.agentId);
    await expect(
        fixture.owner.trpc.agent.get.query({ agentId: taskAgent.agentId, serverId: fixture.serverId })
    ).rejects.toThrow();
});

test('the @mention picker offers Captains, never the Task agent', async () => {
    const { options } = await fixture.owner.trpc.chat.mentionOptions.query({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
    });
    const ids = options.map((option) => option.id);
    expect(ids).toContain(`agent://${fixture.orbitAgentId}`);
    expect(ids).not.toContain(`agent://${taskAgent.agentId}`);
});

test('haus server info --agents and haus profile show never name the Task agent', async () => {
    const directory = await agentGet('/api/agent/server?agents=true');
    expect(directory.status).toBe(200);
    expect(JSON.stringify(directory.body)).toContain('orbit');
    expect(JSON.stringify(directory.body)).not.toContain(taskAgent.handle);
    const profile = await agentGet(`/api/agent/profile?target=@${taskAgent.handle}`);
    expect(profile.status).toBe(404);
});
