import type { AgentMachine, AgentMachineWait } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { readDeliveryState } from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { hasOutstandingScripts } from '../reminders/reminder-script-placement.ts';
import { AgentConfigDeniedError } from '../server-agents/agent-config-errors.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { type PendingMachineChange, readPendingChange } from './machine-change-store.ts';

type IsOnline = (computerId: string) => boolean;

export async function machineChangeHolds(
    tx: HausDatabase,
    input: { agentId: string; isOnline: IsOnline; serverId: string }
) {
    const change = await readPendingChange(tx, input);
    if (!change) {
        return false;
    }
    if (change.fromLastSynced || change.flushedAt) {
        return true;
    }
    const machine = await readMachineId(tx, input);
    return machine !== null && input.isOnline(machine);
}

export async function readMachineState(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string },
    isOnline: IsOnline
) {
    await requireServerMembership(db, member, input.serverId);
    const computerId = await readMachineId(db, input);
    if (!computerId) {
        throw new AgentConfigDeniedError('No configured Agent exists with that id.');
    }
    const change = await readPendingChange(db, input);
    const running = Boolean((await readDeliveryState(db, input.agentId))?.activeRunId);
    const online = isOnline(computerId);
    const scripting = online && (await hasOutstandingScripts(db, { ...input, computerId }));
    return {
        agentId: input.agentId,
        change: change
            ? {
                  computerId: change.computerId,
                  fromLastSynced: change.fromLastSynced,
                  requestedAt: change.requestedAt,
                  waitingFor: waitOf(change, { online, running, scripting }),
              }
            : null,
        computerId,
    } satisfies AgentMachine;
}

function waitOf(
    change: PendingMachineChange,
    now: { online: boolean; running: boolean; scripting: boolean }
) {
    if (now.running) {
        return 'turn' satisfies AgentMachineWait;
    }
    if (now.scripting) {
        return 'script' satisfies AgentMachineWait;
    }
    if (change.fromLastSynced || change.flushedAt) {
        return 'turn' satisfies AgentMachineWait;
    }
    return now.online
        ? ('drive' satisfies AgentMachineWait)
        : ('machine' satisfies AgentMachineWait);
}

async function readMachineId(
    db: Pick<HausDatabase, 'select'>,
    input: { agentId: string; serverId: string }
) {
    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    return agent?.computerId ?? null;
}
