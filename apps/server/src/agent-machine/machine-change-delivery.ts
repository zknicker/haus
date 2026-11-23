import type { DeliveryTransport } from '../agent-delivery/delivery.ts';
import { readAgentServerId } from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { advanceMachineChange } from './advance-machine-change.ts';
import { commitMachineChangeStep, type MachineFences } from './machine-change-effects.ts';
import { listPendingChanges } from './machine-change-store.ts';

export interface MachineChangeDeps {
    db: HausDatabase;
    dispatchAgent: (agentId: string, serverId: string) => Promise<void>;
    fences: MachineFences;
    transport: DeliveryTransport;
}

export async function advanceAgentMachine(
    deps: MachineChangeDeps,
    input: { agentId: string; resendFlush?: boolean }
) {
    const serverId = await readAgentServerId(deps.db, input.agentId);
    if (!serverId) {
        return;
    }
    const step = await deps.db.transaction(async (tx) => {
        await lockServerRow(tx, serverId);
        return await advanceMachineChange(tx, {
            ...input,
            isOnline: (computerId) => deps.transport.isOnline(computerId),
            serverId,
        });
    });
    await commitMachineChangeStep(step, deps);
}

export async function advancePendingMachines(
    deps: MachineChangeDeps,
    filter: { fromComputerId?: string } = {}
) {
    for (const { agentId } of await listPendingChanges(deps.db, filter)) {
        await advanceAgentMachine(deps, {
            agentId,
            resendFlush: filter.fromComputerId !== undefined,
        });
    }
}
