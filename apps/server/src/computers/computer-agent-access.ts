import type { ComputerAgentAccessGrant, ComputerAgentAccessInput } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    computerAgentAccessTable,
    computerUseAgentsTable,
} from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireComputerAttacher, requireComputerSteward } from './computer-steward.ts';

export class ComputerAgentAccessInvalidError extends Error {}

export async function grantComputerAgentAccess(
    db: HausDatabase,
    member: HausUser | null,
    input: ComputerAgentAccessInput
) {
    return await db.transaction(async (tx) => {
        const computer = await requireComputerAttacher(
            tx,
            member,
            input,
            'Only the person who attached this Device can give a Captain access to it.'
        );
        const [agent] = await tx
            .select({ computerId: agentsTable.computerId, retiredAt: agentsTable.retiredAt })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
            .limit(1);
        if (!agent || agent.retiredAt) {
            throw new ComputerAgentAccessInvalidError('That Captain is not on this Server.');
        }
        if (agent.computerId === computer.id) {
            throw new ComputerAgentAccessInvalidError(
                'That Captain lives on this Device, so it already has access.'
            );
        }
        await tx
            .insert(computerAgentAccessTable)
            .values({
                agentId: input.agentId,
                computerId: computer.id,
                grantedByUserId: computer.attacherUserId,
                serverId: input.serverId,
            })
            .onConflictDoNothing();
        return { computerId: computer.id };
    });
}

/** Deletes the grant and the Agent's computer use entry; `revoked` says whether the caller must fence. */
export async function revokeComputerAgentAccess(
    db: HausDatabase,
    member: HausUser | null,
    input: ComputerAgentAccessInput
) {
    return await db.transaction(async (tx) => {
        const computer = await requireComputerSteward(tx, member, input);
        const deleted = await tx
            .delete(computerAgentAccessTable)
            .where(
                and(
                    eq(computerAgentAccessTable.serverId, input.serverId),
                    eq(computerAgentAccessTable.computerId, computer.id),
                    eq(computerAgentAccessTable.agentId, input.agentId)
                )
            )
            .returning({ agentId: computerAgentAccessTable.agentId });
        if (deleted.length === 0) {
            return { computerId: computer.id, revoked: false };
        }
        await tx
            .delete(computerUseAgentsTable)
            .where(
                and(
                    eq(computerUseAgentsTable.serverId, input.serverId),
                    eq(computerUseAgentsTable.computerId, computer.id),
                    eq(computerUseAgentsTable.agentId, input.agentId)
                )
            );
        return { computerId: computer.id, revoked: true };
    });
}

export async function readAgentAccessGrants(
    db: Pick<HausDatabase, 'select'>,
    computerIds: string[]
) {
    const rows =
        computerIds.length > 0
            ? await db
                  .select({
                      agentId: computerAgentAccessTable.agentId,
                      computerId: computerAgentAccessTable.computerId,
                      grantedAt: computerAgentAccessTable.grantedAt,
                      grantedByUserId: computerAgentAccessTable.grantedByUserId,
                  })
                  .from(computerAgentAccessTable)
                  .where(inArray(computerAgentAccessTable.computerId, computerIds))
                  .orderBy(
                      asc(computerAgentAccessTable.grantedAt),
                      asc(computerAgentAccessTable.agentId)
                  )
            : [];
    const grants = new Map<string, ComputerAgentAccessGrant[]>();
    for (const { computerId, ...grant } of rows) {
        grants.set(computerId, [...(grants.get(computerId) ?? []), grant]);
    }
    return grants;
}
