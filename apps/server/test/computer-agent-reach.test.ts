import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentComputerListResponseSchema } from '@haus/api';
import { digest } from './agent-invocations.fixture.ts';
import {
    type AgentAccessBoard,
    accessInput,
    startAgentAccessBoard,
} from './computer-agent-access.fixture.ts';
import { frameOfType } from './runner.fixture.ts';

let board: AgentAccessBoard;

beforeAll(async () => {
    board = await startAgentAccessBoard('agent-reach');
});

afterAll(async () => {
    await board?.close();
});

test('haus computer list shows every Computer with home, access, computer use and presence', async () => {
    await board.attacher.trpc.computer.grantAgentAccess.mutate(accessInput(board));
    await board.attacher.trpc.computer.setComputerUse.mutate({
        computerId: board.laptopId,
        enabled: true,
        serverId: board.setup.serverId,
    });

    const listed = agentComputerListResponseSchema.parse(await listComputers(board.setup.agentId));

    expect(listed.computers).toEqual([
        {
            allowed: true,
            computerId: board.laptopId,
            computerUse: true,
            home: false,
            name: 'Laptop',
            online: true,
            operatingSystem: 'darwin',
        },
        {
            allowed: true,
            computerId: board.setup.computerId,
            computerUse: false,
            home: true,
            name: 'Studio',
            online: false,
            operatingSystem: null,
        },
    ]);
    expect(
        agentComputerListResponseSchema.parse(await listComputers(board.peerAgentId)).computers
    ).toMatchObject([
        { allowed: false, computerId: board.laptopId, computerUse: false, home: false },
        { allowed: true, computerId: board.setup.computerId, home: true },
    ]);

    await board.attacher.trpc.computer.setAgentAccessScope.mutate({
        computerId: board.laptopId,
        scope: 'all',
        serverId: board.setup.serverId,
    });
    expect(
        agentComputerListResponseSchema.parse(await listComputers(board.peerAgentId)).computers[0]
    ).toMatchObject({ allowed: true, computerId: board.laptopId, computerUse: true, home: false });
});

test('retiring an Agent fences it, then sends agent-retire, to an online Computer that is not its home', async () => {
    await board.setup.owner.trpc.agent.delete.mutate({
        agentId: board.peerAgentId,
        confirmation: 'Peer',
        serverId: board.setup.serverId,
    });

    await board.laptop.next(frameOfType('agent-retire', { agentId: board.peerAgentId }));
    expect(
        board.laptop.frames
            .filter((frame) => frame.agentId === board.peerAgentId)
            .map((frame) => frame.type)
    ).toEqual(['agent-fence', 'agent-retire']);
});

test('agent-held gets agent-retire back for retired and unknown Agents only', async () => {
    const gone = 'agt_gone_from_this_server';
    board.laptop.send({
        agentIds: [board.setup.agentId, board.peerAgentId, gone],
        type: 'agent-held',
    });

    await board.laptop.next(frameOfType('agent-retire', { agentId: gone }));
    const retired = board.laptop.frames
        .filter((frame) => frame.type === 'agent-retire')
        .map((frame) => frame.agentId);
    expect(retired).toEqual([board.peerAgentId, board.peerAgentId, gone]);
});

async function listComputers(agentId: string) {
    const mint = await fetch(new URL('/computer/runner/mint', board.setup.harness.url), {
        body: JSON.stringify({
            agentId,
            chatId: null,
            credentialHash: digest(board.setup.computerCredential),
            runId: `run_list_${agentId}`,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(mint.status).toBe(200);
    const { runnerToken } = (await mint.json()) as { runnerToken: string };
    const response = await fetch(new URL('/api/agent/computers', board.setup.harness.url), {
        headers: { authorization: `Bearer ${runnerToken}` },
    });
    expect(response.status).toBe(200);
    return await response.json();
}
