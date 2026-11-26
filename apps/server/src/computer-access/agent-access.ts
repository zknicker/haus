import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computerAgentAccessTable, computersTable } from '../postgres/schema.ts';
import { readTaskSession, taskMayUse } from './task-access.ts';

type Reader = Pick<HausDatabase, 'select'>;

export type AgentAccess = 'allowed' | 'no-access' | 'task-machine-only';

export async function isAgentAllowedOn(
    db: Reader,
    input: { agentId: string; computerId: string; serverId: string }
) {
    return (await readAgentAccess(db, input)) === 'allowed';
}

/**
 * A Captain's Agent access on one Computer. A Task agent has none of its own: it may use only its
 * Task's Machine, exactly while its Captain's or starter's grant there allows it (ADR 0062).
 */
export async function readAgentAccess(
    db: Reader,
    input: { agentId: string; computerId: string; serverId: string }
) {
    const task = await readTaskSession(db, input);
    if (task) {
        if (task.computerId !== input.computerId) {
            const access: AgentAccess = 'task-machine-only';
            return access;
        }
        return (await taskMayUse(db, task, (captainId) =>
            captainAllowedOn(db, { ...input, agentId: captainId })
        ))
            ? 'allowed'
            : 'no-access';
    }
    return (await captainAllowedOn(db, input)) ? 'allowed' : 'no-access';
}

export async function readAccessibleComputerIds(
    db: Reader,
    input: { agentId: string; serverId: string }
) {
    const task = await readTaskSession(db, input);
    if (task) {
        const allowed = await isAgentAllowedOn(db, { ...input, computerId: task.computerId });
        return new Set(allowed ? [task.computerId] : []);
    }
    const rows = await db
        .select({
            computerId: computersTable.id,
            granted: computerAgentAccessTable.agentId,
            scope: computersTable.agentAccessScope,
        })
        .from(computersTable)
        .leftJoin(
            computerAgentAccessTable,
            and(
                eq(computerAgentAccessTable.computerId, computersTable.id),
                eq(computerAgentAccessTable.agentId, input.agentId)
            )
        )
        .where(eq(computersTable.serverId, input.serverId));
    return new Set(
        rows
            .filter((row) => row.scope === 'all' || row.granted !== null)
            .map(({ computerId }) => computerId)
    );
}

/** Every agent whose access no longer reaches this Computer, Task agents on it included. */
export async function readAgentsBarredFrom(db: Reader, computerId: string) {
    const rows = await db
        .select({
            agentId: agentsTable.id,
            kind: agentsTable.kind,
            retiredAt: agentsTable.retiredAt,
            serverId: agentsTable.serverId,
        })
        .from(computersTable)
        .innerJoin(agentsTable, eq(agentsTable.serverId, computersTable.serverId))
        .where(eq(computersTable.id, computerId));
    const barred: { agentId: string; serverId: string }[] = [];
    for (const { agentId, kind, retiredAt, serverId } of rows) {
        const access = await readAgentAccess(db, { agentId, computerId, serverId });
        const offMachine = kind === 'task' && access === 'task-machine-only';
        if (!offMachine && (retiredAt !== null || access !== 'allowed')) {
            barred.push({ agentId, serverId });
        }
    }
    return barred;
}

async function captainAllowedOn(
    db: Reader,
    input: { agentId: string; computerId: string; serverId: string }
) {
    const [row] = await db
        .select({
            granted: computerAgentAccessTable.agentId,
            machineId: agentsTable.computerId,
            scope: computersTable.agentAccessScope,
        })
        .from(agentsTable)
        .innerJoin(
            computersTable,
            and(
                eq(computersTable.serverId, agentsTable.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .leftJoin(
            computerAgentAccessTable,
            and(
                eq(computerAgentAccessTable.computerId, computersTable.id),
                eq(computerAgentAccessTable.agentId, agentsTable.id)
            )
        )
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.agentId),
                eq(agentsTable.kind, 'captain'),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!row) {
        return false;
    }
    return row.machineId === input.computerId || row.scope === 'all' || row.granted !== null;
}
