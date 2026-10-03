import type { CreatedAgentSummary } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { readCreatedAgent } from './agent-created-shape.ts';
import {
    AgentIdentityProtectedError,
    AgentTargetNotFoundError,
    assertAgentDescriptionWrite,
} from './errors.ts';

/**
 * Rewrites another Agent's description. The handle stays: it is derived from
 * the display name at creation and is the alias every `@mention` already in
 * history keys on, so renaming is a separate operation this one does not carry.
 */
export async function updateAgentDescription(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { agent: string; description: string }
): Promise<CreatedAgentSummary> {
    const target = await resolveEditableAgent(db, runner.serverId, input.agent);
    assertAgentDescriptionWrite(input.description, target.description);
    await db
        .update(agentsTable)
        .set({ description: input.description })
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, target.id)));
    const updated = await readCreatedAgent(db, runner.serverId, target.id);
    if (!updated) {
        throw new AgentTargetNotFoundError(target.handle);
    }
    return updated;
}

/** One live, non-Cove Agent of this Server, addressed by `@handle` or `handle`. */
export async function resolveEditableAgent(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    reference: string
): Promise<{ description: string | null; handle: string; id: string }> {
    const handle = reference.replace(/^@/u, '').toLowerCase();
    const [agent] = await db
        .select({
            description: agentsTable.description,
            factoryKind: agentsTable.factoryKind,
            handle: agentsTable.handle,
            id: agentsTable.id,
        })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                sql`lower(${agentsTable.handle}) = ${handle}`,
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new AgentTargetNotFoundError(handle);
    }
    if (agent.factoryKind === 'cove') {
        throw new AgentIdentityProtectedError("Cove's product-owned identity cannot be changed.");
    }
    return { description: agent.description, handle: agent.handle, id: agent.id };
}
