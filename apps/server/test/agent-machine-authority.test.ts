import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    type AgentAccessBoard,
    accessInput,
    startAgentAccessBoard,
} from './computer-agent-access.fixture.ts';

let board: AgentAccessBoard;

beforeAll(async () => {
    board = await startAgentAccessBoard('machine-authority');
});

afterAll(async () => {
    await board?.close();
});

test('only an Owner or Admin changes a Machine, and only onto a Device that allows the Captain', async () => {
    const move = { ...accessInput(board), fromLastSynced: true };
    await expect(board.attacher.trpc.agent.setMachine.mutate(move)).rejects.toThrow(
        'Only a Server Owner or Admin can change a Captain’s Machine.'
    );
    for (const steward of [board.admin, board.setup.owner]) {
        await expect(steward.trpc.agent.setMachine.mutate(move)).rejects.toThrow(
            'This Captain has no access to that Device.'
        );
    }

    await board.attacher.trpc.computer.grantAgentAccess.mutate(accessInput(board));
    expect(await board.admin.trpc.agent.setMachine.mutate(move)).toEqual({
        agentId: board.setup.agentId,
        change: null,
        computerId: board.laptopId,
    });
});

test('the attacher’s own change is the grant for a Captain with no access there', async () => {
    const { serverId } = board.setup;
    await board.setup.harness.sql`
        update server_memberships set role = 'admin'
        where server_id = ${serverId} and user_id = ${board.attacherUserId}
    `;

    expect(
        await board.attacher.trpc.agent.setMachine.mutate({
            ...accessInput(board, board.peerAgentId),
            fromLastSynced: true,
        })
    ).toMatchObject({ change: null, computerId: board.laptopId });
    expect(await accessRows()).toEqual([{ agent_id: board.setup.agentId }]);
});

test('removing a Device moves its Captains to Machines they may use, or refuses', async () => {
    const { owner, serverId } = board.setup;
    const removal = { computerId: board.laptopId, confirmation: 'REMOVE', serverId };
    const home = board.setup.computerId;
    const moves = [
        { agentId: board.setup.agentId, computerId: home },
        { agentId: board.peerAgentId, computerId: home },
    ];

    await expect(owner.trpc.computer.remove.mutate(removal)).rejects.toThrow(
        'Choose a new Machine for Orbit, Peer before removing this device.'
    );
    await expect(
        board.admin.trpc.computer.remove.mutate({ ...removal, machineMoves: moves })
    ).rejects.toThrow('Orbit has no access to that device.');

    await owner.trpc.computer.remove.mutate({ ...removal, machineMoves: moves });

    expect(
        await board.setup.harness.sql`
            select handle, computer_id, placement_generation from agents
            where server_id = ${serverId} order by handle
        `
    ).toEqual([
        { computer_id: home, handle: 'orbit', placement_generation: 2 },
        { computer_id: home, handle: 'peer', placement_generation: 2 },
    ]);
    expect(
        await board.setup.harness.sql`select id from computers where id = ${board.laptopId}`
    ).toEqual([]);
});

async function accessRows() {
    return await board.setup.harness.sql`
        select agent_id from computer_agent_access where computer_id = ${board.laptopId}
    `;
}
