import { type AgentCommand, agentHeldFrameSchema } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable } from '../postgres/schema.ts';

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

export async function ingestAgentHeld(
    db: Reader,
    transport: Pick<ComputerTransport, 'send'>,
    scope: { computerId: string; frame: unknown; serverId: string }
) {
    const parsed = agentHeldFrameSchema.safeParse(scope.frame);
    if (!parsed.success) {
        return false;
    }
    const held = [...new Set(parsed.data.agentIds)];
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
    for (const agentId of held.filter((id) => !liveIds.has(id))) {
        transport.send(scope.computerId, { agentId, type: 'agent-retire' });
    }
    return true;
}
