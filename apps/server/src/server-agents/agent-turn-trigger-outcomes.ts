import {
    AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH,
    type AgentDreamFile,
    type AgentTurnHeartbeatReport,
} from '@haus/api';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { heartbeatReportDedupeKey } from '../agent-delivery/heartbeat-keys.ts';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentDreamSummariesTable,
    agentDreamsTable,
    agentHeartbeatChecksTable,
    agentInboxTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';
import { previewHead } from './agent-turn-trigger.ts';

/** What a dream changed and wrote down, as the Log's outcome line reads it. */
export interface AgentTurnDreamOutcome {
    readonly added: number;
    readonly learned: string | null;
    readonly removed: number;
}

/** What heartbeat and dream runs came to, keyed by run id: the facts a trigger carries. */
export interface AgentTurnOutcomes {
    readonly dreams: ReadonlyMap<string, AgentTurnDreamOutcome>;
    /** A heartbeat's report by the heartbeat's run id. */
    readonly reports: ReadonlyMap<string, AgentTurnHeartbeatReport>;
    /** Heartbeat runs the Server stopped for a message addressed to the Agent. */
    readonly yielded: ReadonlySet<string>;
}

/**
 * The outcomes of one page's heartbeat and dream runs, in a handful of bounded
 * reads however many runs the page holds. A report's `postedChatId` is limited to
 * Chats `userId` can see.
 */
export async function readAgentTurnOutcomes(
    db: HausDatabase,
    input: {
        dreamRunIds: readonly string[];
        heartbeatRunIds: readonly string[];
        serverId: string;
        userId: string;
    }
): Promise<AgentTurnOutcomes> {
    const [dreams, reports, yielded] = await Promise.all([
        readDreamOutcomes(db, input.serverId, input.dreamRunIds),
        readReports(db, input.serverId, input.userId, input.heartbeatRunIds),
        readYieldedRuns(db, input.serverId, input.heartbeatRunIds),
    ]);
    return { dreams, reports, yielded };
}

/** Memory lines each dream changed (from its record) and the first line it wrote it learned. */
async function readDreamOutcomes(
    db: HausDatabase,
    serverId: string,
    runIds: readonly string[]
): Promise<Map<string, AgentTurnDreamOutcome>> {
    const outcomes = new Map<string, AgentTurnDreamOutcome>();
    if (runIds.length === 0) {
        return outcomes;
    }
    const [records, summaries] = await Promise.all([
        db
            .select({ files: agentDreamsTable.files, runId: agentDreamsTable.runId })
            .from(agentDreamsTable)
            .where(
                and(
                    eq(agentDreamsTable.serverId, serverId),
                    inArray(agentDreamsTable.runId, [...runIds])
                )
            ),
        db
            .select({
                runId: agentDreamSummariesTable.runId,
                summary: sql<string>`left(${agentDreamSummariesTable.summary}, ${AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH * 4})`,
            })
            .from(agentDreamSummariesTable)
            .where(
                and(
                    eq(agentDreamSummariesTable.serverId, serverId),
                    inArray(agentDreamSummariesTable.runId, [...runIds])
                )
            ),
    ]);
    const filesOf = new Map(records.map((record) => [record.runId, record.files]));
    const summaryOf = new Map(summaries.map((row) => [row.runId, row.summary]));
    for (const runId of runIds) {
        const files = filesOf.get(runId) ?? [];
        outcomes.set(runId, {
            added: sum(files, 'added'),
            learned: firstSummaryLine(summaryOf.get(runId) ?? null),
            removed: sum(files, 'removed'),
        });
    }
    return outcomes;
}

/**
 * The reports heartbeats filed (`heartbeat-report:<runId>` inbox rows) and where the
 * main session posted after reading each: the Chat of the first message the report's
 * run sent, among Chats the viewer can see. Two reads.
 */
async function readReports(
    db: HausDatabase,
    serverId: string,
    userId: string,
    heartbeatRunIds: readonly string[]
): Promise<Map<string, AgentTurnHeartbeatReport>> {
    const reports = new Map<string, AgentTurnHeartbeatReport>();
    if (heartbeatRunIds.length === 0) {
        return reports;
    }
    const heartbeatRunOf = new Map(
        heartbeatRunIds.map((runId) => [heartbeatReportDedupeKey(runId), runId])
    );
    const inbox = await db
        .select({
            content: sql<string>`left(${agentInboxTable.content}, ${AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH})`,
            dedupeKey: agentInboxTable.dedupeKey,
            reportRunId: agentInboxTable.runId,
        })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, serverId),
                eq(agentInboxTable.source, 'heartbeat_report'),
                inArray(agentInboxTable.dedupeKey, [...heartbeatRunOf.keys()])
            )
        );
    const reportRunIds = inbox.flatMap((row) => (row.reportRunId ? [row.reportRunId] : []));
    const [posts, postedRuns] =
        reportRunIds.length === 0
            ? [[], new Set<string>()]
            : await Promise.all([
                  readFirstPosts(db, serverId, userId, reportRunIds),
                  readPostedRuns(db, serverId, reportRunIds),
              ]);
    const chatOfRun = new Map<string, string>();
    for (const post of posts) {
        if (post.runId && !chatOfRun.has(post.runId)) {
            chatOfRun.set(post.runId, post.chatId);
        }
    }
    for (const row of inbox) {
        const heartbeatRunId = heartbeatRunOf.get(row.dedupeKey);
        if (heartbeatRunId) {
            reports.set(heartbeatRunId, {
                posted: row.reportRunId ? postedRuns.has(row.reportRunId) : false,
                postedChatId: row.reportRunId ? (chatOfRun.get(row.reportRunId) ?? null) : null,
                text: previewHead(row.content),
            });
        }
    }
    return reports;
}

/** Report runs that posted anywhere, whether or not the viewer can see the Chat. */
async function readPostedRuns(
    db: HausDatabase,
    serverId: string,
    reportRunIds: readonly string[]
): Promise<Set<string>> {
    const rows = await db
        .selectDistinct({ runId: chatMessagesTable.runId })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                inArray(chatMessagesTable.runId, [...reportRunIds])
            )
        );
    return new Set(rows.flatMap((row) => (row.runId ? [row.runId] : [])));
}

function readFirstPosts(
    db: HausDatabase,
    serverId: string,
    userId: string,
    reportRunIds: readonly string[]
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
                visibleChats(userId)
            )
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                inArray(chatMessagesTable.runId, [...reportRunIds])
            )
        )
        .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.sequence));
}

/** Which heartbeat runs the Server stopped for a waiting message: one read of the checks. */
async function readYieldedRuns(
    db: HausDatabase,
    serverId: string,
    runIds: readonly string[]
): Promise<Set<string>> {
    if (runIds.length === 0) {
        return new Set();
    }
    const rows = await db
        .select({ runId: agentHeartbeatChecksTable.runId })
        .from(agentHeartbeatChecksTable)
        .where(
            and(
                eq(agentHeartbeatChecksTable.serverId, serverId),
                eq(agentHeartbeatChecksTable.outcome, 'yielded'),
                inArray(agentHeartbeatChecksTable.runId, [...runIds])
            )
        );
    return new Set(rows.flatMap((row) => (row.runId ? [row.runId] : [])));
}

function sum(files: readonly AgentDreamFile[], key: 'added' | 'removed'): number {
    return files.reduce((total, file) => total + file[key], 0);
}

/** First non-empty line of the summary, bullet dash removed, within the contract's bound. */
function firstSummaryLine(summary: string | null): string | null {
    const line = summary
        ?.split('\n')
        .map((text) => text.trim())
        .find((text) => text !== '');
    const text = line?.replace(/^-\s+/u, '');
    return text ? previewHead(text) : null;
}
