import type { AgentCommand, AgentHeldFrame } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable } from '../postgres/schema.ts';
import type { WorkerEffects } from '../workers/worker-effects.ts';

type Reader = Pick<HausDatabase, 'select'>;

interface ComputerTransport {
    isOnline(computerId: string): boolean;
    send(computerId: string, frame: AgentCommand): boolean;
}

export async function readServerComputerIds(db: Reader, serverId: string) {
    const rows = await db
        .select({ id: computersTable.id })
        .from(computersTable)
        .where(eq(computersTable.serverId, serverId));
    return rows.map(({ id }) => id);
}

export async function retireOnServerComputers(
    db: Reader,
    transport: Pick<ComputerTransport, 'isOnline' | 'send'>,
    input: { agentId: string; serverId: string }
) {
    for (const computerId of await readServerComputerIds(db, input.serverId)) {
        if (transport.isOnline(computerId)) {
            transport.send(computerId, { agentId: input.agentId, type: 'agent-retire' });
        }
    }
}

/** Answers `agent-retire` for each held Agent that is retired or gone from the Computer's Server. */
export async function answerHeldAgents(
    db: Reader,
    scope: { computerId: string; serverId: string },
    frame: AgentHeldFrame
) {
    const held = [...new Set(frame.agentIds)];
    const live =
        held.length > 0
            ? await db
                  .select({ id: agentsTable.id })
                  .from(agentsTable)
                  .where(
                      and(
                          eq(agentsTable.serverId, scope.serverId),
                          isNull(agentsTable.retiredAt),
                          inArray(agentsTable.id, held)
                      )
                  )
            : [];
    const liveIds = new Set(live.map(({ id }) => id));
    return {
        events: [],
        frames: held
            .filter((agentId) => !liveIds.has(agentId))
            .map((agentId) => ({
                computerId: scope.computerId,
                frame: { agentId, type: 'agent-retire' as const },
            })),
        wakes: [],
    } satisfies WorkerEffects;
}
