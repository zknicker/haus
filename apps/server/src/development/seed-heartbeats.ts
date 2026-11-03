import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentDreamSummariesTable,
    agentDreamsTable,
    agentHeartbeatChecksTable,
    agentInboxTable,
    agentRunTriggersTable,
    agentsTable,
    agentTurnsTable,
    channelAgentParticipantsTable,
    channelParticipantsTable,
    chatMessagesTable,
    chatsTable,
    remindersTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { ownerContextMessage, shopChannel, type Who } from './seed-heartbeats-plan.ts';
import { buildHeartbeatRecords } from './seed-heartbeats-records.ts';
import { type AgentExecution, type HeartbeatRecords, shopChatId } from './seed-heartbeats-rows.ts';
import { findInboxSeedContext, type InboxSeedContext } from './seed-inbox-context.ts';
import { appendSeedMessages } from './seed-inbox-messages.ts';

export interface HeartbeatSeedResult {
    /** Marks the seed wrote: runs that started plus slots the Server skipped or paused. */
    marks: number;
    seeded: boolean;
}

/**
 * Seeds the Activity Log with every heartbeat and dream state it can show: reported
 * heartbeats (posted and read-only), dreams with lessons, tidy-only and unchanged
 * memory, a failed and a yielded run, quiet runs, and a busy skip and a plan-limit
 * pause, across today and yesterday. Development only; callers gate it.
 *
 * Without `refresh` it writes once and leaves an existing seed alone (the bootstrap
 * path). With `refresh` it replaces the seed's own rows, found by stable ids, and
 * re-times them from now, so rerunning never duplicates and "today" stays today.
 * Nothing here wakes an Agent: rows are the Computer's and Server's own records of
 * work that already happened.
 */
export async function seedDevelopmentHeartbeats(
    db: HausDatabase,
    input: { refresh?: boolean; serverId: string; userId: string }
): Promise<HeartbeatSeedResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const context = await findInboxSeedContext(tx, input);
        if (!context) {
            return { marks: 0, seeded: false };
        }
        const agents = new Map<Who, string>([
            ['blippy', context.blippyId],
            ['cove', context.coveId],
            ['tiny', context.tinyId],
        ]);
        const records = buildHeartbeatRecords({
            agents,
            context,
            execution: await readExecution(tx, context, agents),
            now: new Date(),
        });
        const existing = await alreadySeeded(tx, context, records);
        if (existing && !input.refresh) {
            return { marks: 0, seeded: false };
        }
        if (existing) {
            await clearSeed(tx, context, records);
        }
        await writeMessages(tx, context, records);
        await writeRecords(tx, records);
        return {
            marks:
                records.triggers.filter((row) => row.source !== 'heartbeat_report').length +
                records.checks.filter(
                    (row) => row.outcome === 'skipped' || row.outcome === 'paused'
                ).length,
            seeded: true,
        };
    });
}

async function alreadySeeded(
    tx: HausDatabase,
    context: InboxSeedContext,
    records: HeartbeatRecords
): Promise<boolean> {
    const [marker] = await tx
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, context.serverId),
                eq(chatMessagesTable.id, records.ownerMessage.id)
            )
        )
        .limit(1);
    return marker !== undefined;
}

/** Deletes exactly the rows a previous seed wrote, in dependency order. */
async function clearSeed(tx: HausDatabase, context: InboxSeedContext, records: HeartbeatRecords) {
    const { serverId } = context;
    const runIds = records.triggers.map((row) => row.runId);
    const messageIds = [records.ownerMessage.id, ...records.posts.map((post) => post.id)];
    const ids = (rows: readonly { id?: string | null }[]) =>
        rows.flatMap((row) => (row.id ? [row.id] : []));
    await tx
        .delete(remindersTable)
        .where(
            and(
                eq(remindersTable.serverId, serverId),
                inArray(remindersTable.id, ids(records.reminders))
            )
        );
    await tx
        .delete(chatMessagesTable)
        .where(
            and(eq(chatMessagesTable.serverId, serverId), inArray(chatMessagesTable.id, messageIds))
        );
    await tx
        .delete(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, serverId),
                inArray(agentInboxTable.id, ids(records.inbox))
            )
        );
    await tx
        .delete(agentHeartbeatChecksTable)
        .where(
            and(
                eq(agentHeartbeatChecksTable.serverId, serverId),
                inArray(agentHeartbeatChecksTable.id, ids(records.checks))
            )
        );
    await tx
        .delete(agentDreamSummariesTable)
        .where(
            and(
                eq(agentDreamSummariesTable.serverId, serverId),
                inArray(agentDreamSummariesTable.runId, runIds)
            )
        );
    await tx
        .delete(agentDreamsTable)
        .where(
            and(eq(agentDreamsTable.serverId, serverId), inArray(agentDreamsTable.runId, runIds))
        );
    await tx
        .delete(agentTurnsTable)
        .where(and(eq(agentTurnsTable.serverId, serverId), inArray(agentTurnsTable.runId, runIds)));
    await tx
        .delete(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, serverId),
                inArray(agentRunTriggersTable.runId, runIds)
            )
        );
}

/**
 * The owner's line and each post, appended the way the product numbers them. A
 * post carries the report run's id, which is how the feed finds where it was said.
 */
async function writeMessages(
    tx: HausDatabase,
    context: InboxSeedContext,
    records: HeartbeatRecords
) {
    await ensureShopChannel(tx, context);
    await appendSeedMessages(tx, {
        chatId: shopChatId,
        messages: [
            {
                authorUserId: context.userId,
                content: ownerContextMessage.content,
                createdAt: records.ownerMessage.at,
                id: records.ownerMessage.id,
                nonce: records.ownerMessage.nonce,
            },
        ],
        serverId: context.serverId,
    });
    for (const post of [...records.posts].sort((a, b) => a.at.getTime() - b.at.getTime())) {
        await appendSeedMessages(tx, {
            chatId: shopChatId,
            messages: [
                {
                    authorAgentId: post.agentId,
                    content: post.text,
                    createdAt: post.at,
                    id: post.id,
                    nonce: post.nonce,
                },
            ],
            serverId: context.serverId,
        });
        await tx
            .update(chatMessagesTable)
            .set({ runId: post.reportRunId })
            .where(
                and(
                    eq(chatMessagesTable.serverId, context.serverId),
                    eq(chatMessagesTable.id, post.id)
                )
            );
    }
}

/** #shop, where the Etsy team talks; created once and kept across refreshes. */
async function ensureShopChannel(tx: HausDatabase, context: InboxSeedContext) {
    const { serverId } = context;
    await tx
        .insert(chatsTable)
        .values({ ...shopChannel, id: shopChatId, kind: 'channel', serverId })
        .onConflictDoNothing();
    await tx
        .insert(channelParticipantsTable)
        .values({ chatId: shopChatId, serverId, userId: context.userId })
        .onConflictDoNothing();
    await tx
        .insert(channelAgentParticipantsTable)
        .values(
            [context.blippyId, context.tinyId].map((agentId) => ({
                agentId,
                chatId: shopChatId,
                serverId,
            }))
        )
        .onConflictDoNothing();
}

async function writeRecords(tx: HausDatabase, records: HeartbeatRecords) {
    await tx.insert(agentRunTriggersTable).values(records.triggers);
    await tx.insert(agentTurnsTable).values(records.turns);
    await tx.insert(agentInboxTable).values(records.inbox);
    await tx.insert(agentHeartbeatChecksTable).values(records.checks);
    await tx.insert(agentDreamsTable).values(records.dreams);
    await tx.insert(agentDreamSummariesTable).values(records.summaries);
    await tx.insert(remindersTable).values(records.reminders);
}

async function readExecution(
    tx: HausDatabase,
    context: InboxSeedContext,
    agents: ReadonlyMap<Who, string>
): Promise<Map<Who, AgentExecution>> {
    const rows = await tx
        .select({
            id: agentsTable.id,
            modelId: agentsTable.desiredModelId,
            runtimeId: agentsTable.desiredRuntimeId,
        })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, context.serverId),
                inArray(agentsTable.id, [...agents.values()])
            )
        );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return new Map(
        [...agents].map(([who, id]) => [
            who,
            { modelId: byId.get(id)?.modelId ?? null, runtimeId: byId.get(id)?.runtimeId ?? null },
        ])
    );
}
