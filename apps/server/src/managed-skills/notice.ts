import type { AgentManagedSkillNotice } from '@haus/api';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentManagedSkillsTable as records } from '../postgres/schema.ts';
import type { AgentRef } from './record.ts';

export async function readManagedSkillNotice(db: HausDatabase, agent: AgentRef) {
    const rows = await db
        .select({ release: records.pendingReleaseFingerprint, skillId: records.skillId })
        .from(records)
        .where(
            and(
                eq(records.serverId, agent.serverId),
                eq(records.agentId, agent.agentId),
                isNotNull(records.pendingReleaseFingerprint)
            )
        );
    const notice: AgentManagedSkillNotice = {
        pending: Object.fromEntries(
            rows.flatMap((row) => (row.release ? [[row.skillId, row.release]] : []))
        ),
    };
    return notice;
}

export async function ackManagedSkillNotice(
    db: HausDatabase,
    agent: AgentRef,
    announced: Readonly<Record<string, string>>
) {
    await db.transaction(async (tx) => {
        for (const [skillId, release] of Object.entries(announced)) {
            await tx
                .update(records)
                .set({ pendingReleaseFingerprint: null, updatedAt: new Date() })
                .where(
                    and(
                        eq(records.serverId, agent.serverId),
                        eq(records.agentId, agent.agentId),
                        eq(records.skillId, skillId),
                        eq(records.pendingReleaseFingerprint, release)
                    )
                );
        }
    });
}
