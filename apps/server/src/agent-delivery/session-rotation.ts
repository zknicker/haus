import type { AgentSessionRotation, AgentSessionRotationReason } from '@haus/api';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentSessionRotationsTable, agentsTable } from '../postgres/schema.ts';

/**
 * Records one session rotation. A reset is a fact about the Agent, not a Chat
 * message: every Agent message carries the generation that wrote it, and this
 * row records when and why that generation began.
 */
export async function recordSessionRotation(
    db: HausDatabase,
    input: {
        agentId: string;
        generation: number;
        reason: AgentSessionRotationReason;
        serverId: string;
    }
): Promise<void> {
    const rotatedAt = new Date();
    await db
        .insert(agentSessionRotationsTable)
        .values({
            agentId: input.agentId,
            generation: input.generation,
            previousStartedAt: await readGenerationStart(db, input),
            reason: input.reason,
            rotatedAt,
            serverId: input.serverId,
        })
        .onConflictDoNothing();
}

/** The rotation that began one generation. */
export async function readSessionRotation(
    db: HausDatabase,
    input: { agentId: string; generation: number; serverId: string }
): Promise<AgentSessionRotation | null> {
    const [row] = await db
        .select({
            generation: agentSessionRotationsTable.generation,
            previousStartedAt: agentSessionRotationsTable.previousStartedAt,
            reason: agentSessionRotationsTable.reason,
            rotatedAt: agentSessionRotationsTable.rotatedAt,
        })
        .from(agentSessionRotationsTable)
        .where(
            and(
                eq(agentSessionRotationsTable.serverId, input.serverId),
                eq(agentSessionRotationsTable.agentId, input.agentId),
                eq(agentSessionRotationsTable.generation, input.generation)
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }
    return {
        generation: row.generation,
        previousDurationMs: row.previousStartedAt
            ? Math.max(row.rotatedAt.getTime() - row.previousStartedAt.getTime(), 0)
            : null,
        reason: row.reason,
        rotatedAt: row.rotatedAt.toISOString(),
    };
}

/**
 * When the generation being retired began: the rotation that started it, or the
 * Agent's own creation for the first generation.
 */
async function readGenerationStart(
    db: HausDatabase,
    input: { agentId: string; generation: number; serverId: string }
): Promise<Date | null> {
    const [previous] = await db
        .select({ rotatedAt: agentSessionRotationsTable.rotatedAt })
        .from(agentSessionRotationsTable)
        .where(
            and(
                eq(agentSessionRotationsTable.serverId, input.serverId),
                eq(agentSessionRotationsTable.agentId, input.agentId),
                lt(agentSessionRotationsTable.generation, input.generation)
            )
        )
        .orderBy(desc(agentSessionRotationsTable.generation))
        .limit(1);
    if (previous) {
        return previous.rotatedAt;
    }
    const [agent] = await db
        .select({ createdAt: agentsTable.createdAt })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    return agent?.createdAt ?? null;
}
