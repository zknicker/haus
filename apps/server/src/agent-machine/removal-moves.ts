import type { ComputerRemovalMove } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { readDeliveryState } from '../agent-delivery/store.ts';
import { ComputerSetupDeniedError } from '../computers/service.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { type MachineChangeStep, switchMachine } from './advance-machine-change.ts';
import { destinationAllows } from './machine-authority.ts';

export async function moveAgentsOffRemovedComputer(
    tx: HausDatabase,
    input: {
        computerId: string;
        moves: readonly ComputerRemovalMove[];
        serverId: string;
        userId: string;
    }
) {
    const agents = await tx
        .select({ displayName: agentsTable.displayName, id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.computerId, input.computerId),
                isNull(agentsTable.retiredAt)
            )
        );
    const destinations = new Map(input.moves.map((move) => [move.agentId, move.computerId]));
    const unmoved = agents.filter((agent) => !destinations.has(agent.id));
    if (unmoved.length > 0) {
        throw new ComputerSetupDeniedError(
            `Choose a new Machine for ${names(unmoved)} before removing this device.`
        );
    }
    const steps: MachineChangeStep[] = [];
    for (const agent of agents) {
        const to = destinations.get(agent.id);
        if (!to || to === input.computerId) {
            throw new ComputerSetupDeniedError(`Choose another device for ${agent.displayName}.`);
        }
        const scope = { agentId: agent.id, serverId: input.serverId };
        if (!(await destinationAllows(tx, { ...scope, computerId: to, userId: input.userId }))) {
            throw new ComputerSetupDeniedError(
                `${agent.displayName} has no access to that device. Its attacher can give access, or move it there themselves.`
            );
        }
        if ((await readDeliveryState(tx, agent.id))?.activeRunId) {
            throw new ComputerSetupDeniedError(
                `${agent.displayName} is in a turn. Remove this device after it ends.`
            );
        }
        steps.push(await switchMachine(tx, { ...scope, from: input.computerId, to }));
    }
    return steps;
}

function names(agents: readonly { displayName: string }[]) {
    return agents.map((agent) => agent.displayName).join(', ');
}
