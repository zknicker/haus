import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    type AgentAccessBoard,
    accessInput,
    startAgentAccessBoard,
} from './computer-agent-access.fixture.ts';
import { frameOfType } from './runner.fixture.ts';

let board: AgentAccessBoard;

beforeAll(async () => {
    board = await startAgentAccessBoard('agent-access');
});

afterAll(async () => {
    await board?.close();
});

test('only the attacher grants Agent access, and computer.list shows who may change it', async () => {
    const input = accessInput(board);
    await expect(board.admin.trpc.computer.grantAgentAccess.mutate(input)).rejects.toThrow(
        'Only the person who attached this Device can give a Captain access to it.'
    );
    await expect(board.setup.owner.trpc.computer.grantAgentAccess.mutate(input)).rejects.toThrow(
        'Only the person who attached this Device'
    );

    expect(await board.attacher.trpc.computer.grantAgentAccess.mutate(input)).toEqual({
        computerId: board.laptopId,
    });

    const [mine] = await board.attacher.trpc.computer.list.query({
        serverId: board.setup.serverId,
    });
    expect(mine).toMatchObject({
        agentAccessGrants: [
            { agentId: board.setup.agentId, grantedByUserId: board.attacherUserId },
        ],
        canEnableWorkers: true,
        canGrantAgentAccess: true,
        canRevokeAgentAccess: true,
        id: board.laptopId,
    });
    const seen = await board.admin.trpc.computer.list.query({ serverId: board.setup.serverId });
    expect(seen.find((computer) => computer.id === board.laptopId)).toMatchObject({
        canChangeWorkers: true,
        canEnableWorkers: false,
        canGrantAgentAccess: false,
        canRevokeAgentAccess: true,
    });
});

test('a home Agent cannot be granted the Device it lives on', async () => {
    await expect(
        board.setup.owner.trpc.computer.grantAgentAccess.mutate({
            ...accessInput(board),
            computerId: board.setup.computerId,
        })
    ).rejects.toThrow('That Captain lives on this Device, so it already has access.');
});

test('the computer use list names a granted Agent and refuses one the Device does not allow', async () => {
    const device = { computerId: board.laptopId, serverId: board.setup.serverId };
    await expect(
        board.attacher.trpc.computer.setComputerUseAgents.mutate({
            ...device,
            agents: { agentIds: [board.peerAgentId], kind: 'named' },
        })
    ).rejects.toThrow('Only Captains this Device allows can be allowed to use it.');

    await board.attacher.trpc.computer.setComputerUseAgents.mutate({
        ...device,
        agents: { agentIds: [board.setup.agentId], kind: 'named' },
    });

    expect(await computerUseRows()).toEqual([{ agent_id: board.setup.agentId }]);
});

test("a home change drops only the old home's computer use entry, not a borrowed one", async () => {
    const { agentId, computerId, harness, serverId } = board.setup;
    const studio = computerId;
    await harness.sql`
        insert into computer_use_agents (agent_id, computer_id, server_id)
        values (${agentId}, ${studio}, ${serverId})
    `;
    await harness.sql`update agents set computer_id = ${board.laptopId} where id = ${agentId}`;

    expect(await computerUseRows()).toEqual([{ agent_id: agentId }]);
    expect(
        await harness.sql`
            select agent_id from computer_use_agents where computer_id = ${studio}
        `
    ).toEqual([]);

    await harness.sql`update agents set computer_id = ${studio} where id = ${agentId}`;
    await harness.sql`
        insert into computer_use_agents (agent_id, computer_id, server_id)
        values (${agentId}, ${board.laptopId}, ${serverId})
    `;
});

test('an Admin revokes access, which drops its computer use entry and fences the Agent there', async () => {
    const input = accessInput(board);
    expect(await board.admin.trpc.computer.revokeAgentAccess.mutate(input)).toEqual({
        computerId: board.laptopId,
    });

    await board.laptop.next(frameOfType('agent-fence', { agentId: board.setup.agentId }));
    expect(await computerUseRows()).toEqual([]);
    expect(
        await board.setup.harness.sql`
            select agent_id from computer_agent_access where computer_id = ${board.laptopId}
        `
    ).toEqual([]);
    await expect(
        board.attacher.trpc.computer.setComputerUseAgents.mutate({
            agents: { agentIds: [board.setup.agentId], kind: 'named' },
            computerId: board.laptopId,
            serverId: board.setup.serverId,
        })
    ).rejects.toThrow('Only Captains this Device allows');
});

test('only the attacher turns Workers on; an Admin can change the limit while on and turn it off', async () => {
    const device = { computerId: board.laptopId, serverId: board.setup.serverId };
    await expect(
        board.admin.trpc.computer.setWorkers.mutate({ ...device, enabled: true })
    ).rejects.toThrow(
        'Only the person who attached this Computer can turn on "Workers can run here".'
    );

    await board.attacher.trpc.computer.setWorkers.mutate({ ...device, enabled: true });
    await board.admin.trpc.computer.setWorkers.mutate({ ...device, enabled: true, limit: 2 });
    expect(await workerSwitch()).toEqual([{ worker_limit: 2, workers_enabled: true }]);

    await board.admin.trpc.computer.setWorkers.mutate({ ...device, enabled: false });
    expect(await workerSwitch()).toEqual([{ worker_limit: 2, workers_enabled: false }]);
});

test('an Admin cannot create an Agent on a Computer someone else attached', async () => {
    const projects = await board.setup.owner.trpc.project.list.query({
        serverId: board.setup.serverId,
    });
    await expect(
        board.admin.trpc.agent.create.mutate({
            computerId: board.setup.computerId,
            displayName: 'Stray',
            handle: 'stray',
            homeProjectId: projects[0]?.chatId ?? '',
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            runtimeId: 'codex',
            serverId: board.setup.serverId,
        })
    ).rejects.toThrow('Only the person who attached that Computer can create an Agent on it.');
});

async function computerUseRows() {
    return await board.setup.harness.sql`
        select agent_id from computer_use_agents where computer_id = ${board.laptopId}
    `;
}

async function workerSwitch() {
    return await board.setup.harness.sql`
        select worker_limit, workers_enabled from computers where id = ${board.laptopId}
    `;
}
