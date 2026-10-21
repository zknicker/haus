import { and, asc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { heartbeatReportDedupeKey } from '../agent-delivery/heartbeat-keys.ts';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentDeliveryTable,
    agentHeartbeatChecksTable,
    agentInboxTable,
    agentRunTriggersTable,
    agentTurnsTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';

/** A heartbeat or dream run in the window, settled (has a turn) or still running. */
export interface WindowRun {
    agentId: string;
    durationMs: number | null;
    kind: 'daytime' | 'nightly';
    runId: string;
    startedAt: Date;
    /** The run's own turn status; null while it has none. */
    status: 'completed' | 'failed' | 'interrupted' | null;
    tokens: number | null;
}

export interface WindowCheck {
    agentId: string;
    createdAt: Date;
    kind: 'daytime' | 'nightly';
    outcome: 'paused' | 'skipped' | 'yielded';
    runId: string | null;
    skipReason: 'busy' | 'no-activity' | 'not-configured' | 'plan-limit' | 'stopped' | null;
}

interface Window {
    agentIds: string[];
    from: Date;
    serverId: string;
    to: Date;
}

const kindOf = { dream: 'nightly', heartbeat: 'daytime' } as const;

/**
 * Heartbeat and dream runs that started in the window: settled ones from
 * `agent_turns` (served by its Server/start index), plus an Agent's active run when
 * it has no turn yet. Two reads.
 */
export async function readWindowRuns(db: HausDatabase, window: Window): Promise<WindowRun[]> {
    const { agentIds, from, serverId, to } = window;
    const sources = ['dream', 'heartbeat'];
    const settled = await db
        .select({
            agentId: agentTurnsTable.agentId,
            endedAt: agentTurnsTable.endedAt,
            runId: agentTurnsTable.runId,
            source: agentRunTriggersTable.source,
            startedAt: agentTurnsTable.startedAt,
            status: agentTurnsTable.status,
            totalTokens: agentTurnsTable.totalTokens,
        })
        .from(agentTurnsTable)
        .innerJoin(
            agentRunTriggersTable,
            and(
                eq(agentRunTriggersTable.serverId, agentTurnsTable.serverId),
                eq(agentRunTriggersTable.agentId, agentTurnsTable.agentId),
                eq(agentRunTriggersTable.runId, agentTurnsTable.runId)
            )
        )
        .where(
            and(
                eq(agentTurnsTable.serverId, serverId),
                gte(agentTurnsTable.startedAt, from),
                lt(agentTurnsTable.startedAt, to),
                inArray(agentTurnsTable.agentId, agentIds),
                inArray(agentRunTriggersTable.source, sources)
            )
        );
    const active = await db
        .select({
            agentId: agentDeliveryTable.agentId,
            runId: agentRunTriggersTable.runId,
            source: agentRunTriggersTable.source,
            startedAt: agentRunTriggersTable.createdAt,
        })
        .from(agentDeliveryTable)
        .innerJoin(
            agentRunTriggersTable,
            and(
                eq(agentRunTriggersTable.serverId, agentDeliveryTable.serverId),
                eq(agentRunTriggersTable.agentId, agentDeliveryTable.agentId),
                eq(agentRunTriggersTable.runId, agentDeliveryTable.activeRunId)
            )
        )
        .leftJoin(
            agentTurnsTable,
            and(
                eq(agentTurnsTable.serverId, agentRunTriggersTable.serverId),
                eq(agentTurnsTable.agentId, agentRunTriggersTable.agentId),
                eq(agentTurnsTable.runId, agentRunTriggersTable.runId)
            )
        )
        .where(
            and(
                eq(agentDeliveryTable.serverId, serverId),
                inArray(agentDeliveryTable.agentId, agentIds),
                inArray(agentRunTriggersTable.source, sources),
                gte(agentRunTriggersTable.createdAt, from),
                lt(agentRunTriggersTable.createdAt, to),
                isNull(agentTurnsTable.id)
            )
        );
    return [
        ...settled.map((row) => ({
            agentId: row.agentId,
            durationMs: Math.max(0, row.endedAt.getTime() - row.startedAt.getTime()),
            kind: kindOf[row.source as keyof typeof kindOf],
            runId: row.runId,
            startedAt: row.startedAt,
            status: row.status,
            tokens: row.totalTokens,
        })),
        ...active.map((row) => ({
            agentId: row.agentId,
            durationMs: null,
            kind: kindOf[row.source as keyof typeof kindOf],
            runId: row.runId,
            startedAt: row.startedAt,
            status: null,
            tokens: null,
        })),
    ];
}

/**
 * The window's skipped, paused, and yielded decisions, and the start of each yielded
 * run (its turn may be missing or outside the window). One read per concern, served
 * by the `(server, agent, created_at)` index.
 */
export async function readWindowChecks(
    db: HausDatabase,
    window: Window
): Promise<{ checks: WindowCheck[]; yieldedStarts: Map<string, Date> }> {
    const checks = await db
        .select({
            agentId: agentHeartbeatChecksTable.agentId,
            createdAt: agentHeartbeatChecksTable.createdAt,
            kind: agentHeartbeatChecksTable.kind,
            outcome: agentHeartbeatChecksTable.outcome,
            runId: agentHeartbeatChecksTable.runId,
            skipReason: agentHeartbeatChecksTable.skipReason,
        })
        .from(agentHeartbeatChecksTable)
        .where(
            and(
                eq(agentHeartbeatChecksTable.serverId, window.serverId),
                inArray(agentHeartbeatChecksTable.agentId, window.agentIds),
                gte(agentHeartbeatChecksTable.createdAt, window.from),
                lt(agentHeartbeatChecksTable.createdAt, window.to)
            )
        )
        .orderBy(asc(agentHeartbeatChecksTable.createdAt));
    const rows = checks.filter((row): row is WindowCheck => row.outcome !== 'queued');
    const yieldedRunIds = rows.flatMap((row) => (row.runId ? [row.runId] : []));
    const starts =
        yieldedRunIds.length === 0
            ? []
            : await db
                  .select({
                      createdAt: agentRunTriggersTable.createdAt,
                      runId: agentRunTriggersTable.runId,
                  })
                  .from(agentRunTriggersTable)
                  .where(
                      and(
                          eq(agentRunTriggersTable.serverId, window.serverId),
                          inArray(agentRunTriggersTable.agentId, window.agentIds),
                          inArray(agentRunTriggersTable.runId, yieldedRunIds)
                      )
                  );
    return {
        checks: rows,
        yieldedStarts: new Map(starts.map((row) => [row.runId, row.createdAt])),
    };
}

/**
 * The reports the runs filed (`heartbeat-report:<runId>` inbox rows) and where the
 * main session posted after reading each: the Chat of the first message the report
 * run's Agent sent, among Chats the viewer can see. Two reads.
 */
export async function readReports(
    db: HausDatabase,
    input: { agentIds: string[]; from: Date; runIds: string[]; serverId: string; userId: string }
): Promise<Map<string, { postedChatId: string | null; text: string }>> {
    const reports = new Map<string, { postedChatId: string | null; text: string }>();
    if (input.runIds.length === 0) {
        return reports;
    }
    const keyToRun = new Map(input.runIds.map((id) => [heartbeatReportDedupeKey(id), id]));
    const inbox = await db
        .select({
            content: agentInboxTable.content,
            dedupeKey: agentInboxTable.dedupeKey,
            reportRunId: agentInboxTable.runId,
        })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, input.serverId),
                inArray(agentInboxTable.agentId, input.agentIds),
                inArray(agentInboxTable.dedupeKey, [...keyToRun.keys()])
            )
        );
    const reportRunIds = inbox.flatMap((row) => (row.reportRunId ? [row.reportRunId] : []));
    const posts = reportRunIds.length === 0 ? [] : await readFirstPosts(db, input, reportRunIds);
    const chatOfRun = new Map<string, string>();
    for (const post of posts) {
        if (post.runId && !chatOfRun.has(post.runId)) {
            chatOfRun.set(post.runId, post.chatId);
        }
    }
    for (const row of inbox) {
        const runId = keyToRun.get(row.dedupeKey);
        if (runId) {
            reports.set(runId, {
                postedChatId: row.reportRunId ? (chatOfRun.get(row.reportRunId) ?? null) : null,
                text: row.content,
            });
        }
    }
    return reports;
}

function readFirstPosts(
    db: HausDatabase,
    input: { agentIds: string[]; from: Date; serverId: string; userId: string },
    reportRunIds: string[]
) {
    return db
        .select({ chatId: chatMessagesTable.chatId, runId: chatMessagesTable.runId })
        .from(chatMessagesTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, chatMessagesTable.serverId),
                eq(chatsTable.id, chatMessagesTable.chatId),
                isNull(chatsTable.deletedAt),
                visibleChats(input.userId)
            )
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                inArray(chatMessagesTable.authorAgentId, input.agentIds),
                gte(chatMessagesTable.createdAt, input.from),
                inArray(chatMessagesTable.runId, reportRunIds)
            )
        )
        .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.sequence));
}
