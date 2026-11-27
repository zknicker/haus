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
        canGrantAgentAccess: true,
        canRevokeAgentAccess: true,
        id: board.laptopId,
    });
    const seen = await board.admin.trpc.computer.list.query({ serverId: board.setup.serverId });
    expect(seen.find((computer) => computer.id === board.laptopId)).toMatchObject({
        canGrantAgentAccess: false,
        canRevokeAgentAccess: true,
    });
});

test('an Agent cannot be granted the Device that is its Machine', async () => {
    await expect(
        board.setup.owner.trpc.computer.grantAgentAccess.mutate({
            ...accessInput(board),
            computerId: board.setup.computerId,
        })
    ).rejects.toThrow('This Device is that Captain’s Machine, so it already has access.');
});

test('only the attacher allows All Captains; an Admin narrows it back and fences who it bars', async () => {
    const device = { computerId: board.laptopId, serverId: board.setup.serverId };
    await expect(
        board.admin.trpc.computer.setAgentAccessScope.mutate({ ...device, scope: 'all' })
    ).rejects.toThrow('Only the person who attached this Device can let every Captain use it.');

    await board.attacher.trpc.computer.setAgentAccessScope.mutate({ ...device, scope: 'all' });
    const [mine] = await board.attacher.trpc.computer.list.query({
        serverId: board.setup.serverId,
    });
    expect(mine).toMatchObject({ agentAccessScope: 'all', id: board.laptopId });

    await board.admin.trpc.computer.setAgentAccessScope.mutate({ ...device, scope: 'selected' });
    await board.laptop.next(frameOfType('agent-fence', { agentId: board.peerAgentId }));
    expect(await accessRows()).toEqual([{ agent_id: board.setup.agentId }]);
});

test('an Admin revokes access, which fences the Agent there', async () => {
    const input = accessInput(board);
    expect(await board.admin.trpc.computer.revokeAgentAccess.mutate(input)).toEqual({
        computerId: board.laptopId,
    });

    await board.laptop.next(frameOfType('agent-fence', { agentId: board.setup.agentId }));
    expect(await accessRows()).toEqual([]);
});

test('only the attacher turns computer use on; an Admin turns it off', async () => {
    const device = { computerId: board.laptopId, serverId: board.setup.serverId };
    await expect(
        board.admin.trpc.computer.setComputerUse.mutate({ ...device, enabled: true })
    ).rejects.toThrow('Only the person who attached this Device can turn computer use on.');
    const seen = await board.admin.trpc.computer.list.query({ serverId: board.setup.serverId });
    expect(seen.find((computer) => computer.id === board.laptopId)).toMatchObject({
        canChangeComputerUse: true,
        canEnableComputerUse: false,
    });

    await board.attacher.trpc.computer.setComputerUse.mutate({ ...device, enabled: true });
    await board.admin.trpc.computer.setComputerUse.mutate({ ...device, enabled: false });
    expect(
        await board.setup.harness.sql`
            select computer_use_enabled from computers where id = ${board.laptopId}
        `
    ).toEqual([{ computer_use_enabled: false }]);
});

test('an Admin creates an Agent on a Computer someone else attached only when it allows All Captains', async () => {
    const projects = await board.setup.owner.trpc.project.list.query({
        serverId: board.setup.serverId,
    });
    const create = (handle: string) =>
        board.admin.trpc.agent.create.mutate({
            computerId: board.setup.computerId,
            displayName: handle,
            handle,
            homeProjectId: projects[0]?.chatId ?? '',
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            runtimeId: 'codex',
            serverId: board.setup.serverId,
        });
    await expect(create('stray')).rejects.toThrow(
        'Only the person who attached that Computer can create an Agent on it'
    );

    const adminUserId = board.setup.harness.humans.userIdForSubject('user_agent_access_cal');
    await board.setup.harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${board.setup.serverId}, ${projects[0]?.chatId ?? ''}, ${adminUserId})
        on conflict do nothing
    `;
    await board.setup.owner.trpc.computer.setAgentAccessScope.mutate({
        computerId: board.setup.computerId,
        scope: 'all',
        serverId: board.setup.serverId,
    });
    expect((await create('welcome')).agent).toMatchObject({ computerId: board.setup.computerId });
});

async function accessRows() {
    return await board.setup.harness.sql`
        select agent_id from computer_agent_access where computer_id = ${board.laptopId}
    `;
}
