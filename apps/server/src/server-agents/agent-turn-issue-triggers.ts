import { isBatchedChatlessInboxSource } from '@haus/api';
import { and, count, eq, inArray } from 'drizzle-orm';
import { issueIdOfWakeKey } from '../issues/issue-inbox.ts';
import { readIssues } from '../issues/issue-read.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, issuesTable } from '../postgres/schema.ts';
import type { AgentTurnIssueTriggers, AgentTurnTriggerRecord } from './agent-turn-trigger.ts';

/**
 * Names the Issue runs on a page: each run's lead Issue (the row its trigger recorded) and how
 * many more items of its kind rode the same run, in two reads. An Issue that no longer exists
 * leaves its trigger unknown.
 */
export async function readAgentTurnIssueTriggers(
    db: HausDatabase,
    serverId: string,
    records: readonly (AgentTurnTriggerRecord | null)[]
): Promise<AgentTurnIssueTriggers> {
    const leads = records.flatMap((record) => {
        const issueId =
            record && isBatchedChatlessInboxSource(record.source)
                ? issueIdOfWakeKey(record.workId)
                : null;
        return record && issueId ? [{ issueId, record }] : [];
    });
    if (leads.length === 0) {
        return new Map();
    }
    const issues = await readIssues(
        db,
        serverId,
        inArray(
            issuesTable.id,
            leads.map((lead) => lead.issueId)
        )
    );
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const runIds = leads.flatMap(({ record }) => record.runId ?? []);
    const agentIds = [...new Set(leads.flatMap(({ record }) => record.agentId ?? []))];
    const rows =
        runIds.length === 0
            ? []
            : await db
                  .select({
                      items: count(),
                      runId: agentInboxTable.runId,
                      source: agentInboxTable.source,
                  })
                  .from(agentInboxTable)
                  .where(
                      and(
                          eq(agentInboxTable.serverId, serverId),
                          agentIds.length > 0
                              ? inArray(agentInboxTable.agentId, agentIds)
                              : undefined,
                          inArray(agentInboxTable.source, ['issue_assignment', 'issue_event']),
                          inArray(agentInboxTable.runId, runIds)
                      )
                  )
                  .groupBy(agentInboxTable.runId, agentInboxTable.source);
    const itemsByRun = new Map(rows.map((row) => [`${row.runId}:${row.source}`, row.items]));
    return new Map(
        leads.flatMap(({ issueId, record }) => {
            const issue = issueById.get(issueId);
            if (!issue) {
                return [];
            }
            const more = (itemsByRun.get(`${record.runId ?? null}:${record.source}`) ?? 1) - 1;
            return [
                [
                    record.workId,
                    {
                        code: issue.code,
                        issueId,
                        kind: 'issue' as const,
                        ...(more > 0 ? { more } : {}),
                        title: issue.title,
                    },
                ] as const,
            ];
        })
    );
}
