import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentManagedSkillsTable as records } from '../postgres/schema.ts';

export interface AgentRef {
    readonly agentId: string;
    readonly serverId: string;
}

export interface SkillRecord {
    readonly pending: string | null;
    readonly release: string;
    readonly seeded: string;
}

export async function readSkillRecord(tx: HausDatabase, agent: AgentRef, skillId: string) {
    const [row] = await tx
        .select()
        .from(records)
        .where(
            and(
                eq(records.serverId, agent.serverId),
                eq(records.agentId, agent.agentId),
                eq(records.skillId, skillId)
            )
        )
        .limit(1);
    return row;
}

export async function writeSkillRecord(
    tx: HausDatabase,
    agent: AgentRef,
    skillId: string,
    record: SkillRecord
) {
    const values = {
        pendingReleaseFingerprint: record.pending,
        releaseFingerprint: record.release,
        seededFingerprint: record.seeded,
        updatedAt: new Date(),
    };
    await tx
        .insert(records)
        .values({ ...values, agentId: agent.agentId, serverId: agent.serverId, skillId })
        .onConflictDoUpdate({
            set: values,
            target: [records.serverId, records.agentId, records.skillId],
        });
}
