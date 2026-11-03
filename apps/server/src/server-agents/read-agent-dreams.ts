import type {
    AgentDreamDetail,
    AgentDreamFile,
    AgentDreamInput,
    AgentDreamSummary,
    AgentDreamsInput,
    AgentDreamsPage,
} from '@haus/api';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { type DreamEnrichment, readDreamEnrichments } from '../heartbeat/dream-enrichment.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDreamsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireMemberAgent } from './agent-delivery-control.ts';

/**
 * One Agent's dreams, newest first, without patches. Any member who may view the
 * Agent may read them: a dream records what the Agent now remembers.
 */
export async function listAgentDreams(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentDreamsInput
): Promise<AgentDreamsPage> {
    await requireMemberAgent(db, member, input);
    const cursor = input.cursor;
    const rows = await db
        .select(summaryColumns)
        .from(agentDreamsTable)
        .where(
            and(
                eq(agentDreamsTable.serverId, input.serverId),
                eq(agentDreamsTable.agentId, input.agentId),
                cursor
                    ? or(
                          lt(agentDreamsTable.startedAt, new Date(cursor.startedAt)),
                          and(
                              eq(agentDreamsTable.startedAt, new Date(cursor.startedAt)),
                              lt(agentDreamsTable.runId, cursor.runId)
                          )
                      )
                    : undefined
            )
        )
        .orderBy(desc(agentDreamsTable.startedAt), desc(agentDreamsTable.runId))
        .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    const enrichments = await readDreamEnrichments(db, {
        agentId: input.agentId,
        dreams: page,
        serverId: input.serverId,
    });
    const dreams = page.map((row) => toSummary(row, enrichments.get(row.runId)));
    const last = dreams.at(-1);
    return {
        dreams,
        nextCursor:
            rows.length > input.limit && last
                ? { runId: last.runId, startedAt: last.startedAt }
                : null,
    };
}

/** One dream with its patch, or null when this Agent has no record for the run. */
export async function readAgentDream(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentDreamInput
): Promise<AgentDreamDetail | null> {
    await requireMemberAgent(db, member, input);
    const [row] = await db
        .select({ ...summaryColumns, patch: agentDreamsTable.patch })
        .from(agentDreamsTable)
        .where(
            and(
                eq(agentDreamsTable.serverId, input.serverId),
                eq(agentDreamsTable.agentId, input.agentId),
                eq(agentDreamsTable.runId, input.runId)
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }
    const enrichments = await readDreamEnrichments(db, {
        agentId: input.agentId,
        dreams: [row],
        serverId: input.serverId,
    });
    return { ...toSummary(row, enrichments.get(row.runId)), patch: row.patch };
}

const summaryColumns = {
    files: agentDreamsTable.files,
    finishedAt: agentDreamsTable.finishedAt,
    runId: agentDreamsTable.runId,
    startedAt: agentDreamsTable.startedAt,
    truncated: agentDreamsTable.truncated,
};

function toSummary(
    row: {
        files: AgentDreamFile[];
        finishedAt: Date;
        runId: string;
        startedAt: Date;
        truncated: boolean;
    },
    enrichment: DreamEnrichment = { followUps: [], summary: null }
): AgentDreamSummary {
    return {
        added: row.files.reduce((total, file) => total + file.added, 0),
        files: row.files,
        finishedAt: row.finishedAt.toISOString(),
        followUps: enrichment.followUps,
        removed: row.files.reduce((total, file) => total + file.removed, 0),
        runId: row.runId,
        startedAt: row.startedAt.toISOString(),
        summary: enrichment.summary,
        truncated: row.truncated,
    };
}
