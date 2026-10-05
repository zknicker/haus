import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { insertMessageCause, resolveMessageCause } from '../automations/message-cause.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    channelAgentParticipantsTable,
    channelParticipantsTable,
    chatMessagesTable,
    chatsTable,
    reminderFiresTable,
    remindersTable,
    triggerFiresTable,
    triggersTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { findInboxSeedContext } from './seed-inbox-context.ts';
import { appendSeedMessages, type SeedMessage } from './seed-inbox-messages.ts';

const minuteMs = 60_000;

/**
 * Adds **#automations**: Agent answers to Reminder and Trigger fires, so the
 * transcript's cause lines have real records behind them. Idempotent and
 * separate, so existing dev workspaces gain it too.
 *
 * The automations and fires are written directly, like the other seeds' records,
 * but each cause goes through the Server's own resolve-and-record path. The
 * scheduled Reminder's next fire is a week out, and the Trigger's secret is
 * discarded, so nothing here wakes an Agent on its own.
 */
export async function seedDevelopmentAutomationCauses(
    db: HausDatabase,
    input: { serverId: string; userId: string }
) {
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [existing] = await tx
            .select({ id: chatsTable.id })
            .from(chatsTable)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.name, 'automations')))
            .limit(1);
        if (existing) {
            return;
        }
        const context = await findInboxSeedContext(tx, input);
        if (!context) {
            return;
        }
        const { blippyId, serverId, tinyId, userId } = context;
        const chatId = createOpaqueId('cht');
        await tx
            .insert(chatsTable)
            .values({ id: chatId, kind: 'channel', name: 'automations', serverId });
        await tx.insert(channelParticipantsTable).values({ chatId, serverId, userId });
        await tx.insert(channelAgentParticipantsTable).values([
            { agentId: blippyId, chatId, serverId },
            { agentId: tinyId, chatId, serverId },
        ]);

        const start = Date.now() - 90 * minuteMs;
        const at = (minutes: number) => new Date(start + minutes * minuteMs);
        const ids = {
            alone: createOpaqueId('msg'),
            archived: createOpaqueId('msg'),
            askChecklist: createOpaqueId('msg'),
            askReviews: createOpaqueId('msg'),
            plainReply: createOpaqueId('msg'),
            stacked: createOpaqueId('msg'),
            trigger: createOpaqueId('msg'),
        };
        const human = (id: string, minutes: number, content: string): SeedMessage => ({
            authorUserId: userId,
            content,
            createdAt: at(minutes),
            id,
            nonce: `dev-automations-${id}`,
        });
        const agent = (
            id: string,
            agentId: string,
            minutes: number,
            content: string
        ): SeedMessage => ({
            authorAgentId: agentId,
            content,
            createdAt: at(minutes),
            id,
            nonce: `dev-automations-${id}`,
        });
        await appendSeedMessages(tx, {
            chatId,
            messages: [
                human(
                    ids.askReviews,
                    0,
                    '@blippy can you keep an eye on the review queue this week?'
                ),
                agent(
                    ids.plainReply,
                    blippyId,
                    2,
                    'Sure — I set a reminder and will post what I find here.'
                ),
                human(
                    ids.askChecklist,
                    4,
                    'Also remind me every Monday to run the release checklist.'
                ),
                agent(
                    ids.alone,
                    blippyId,
                    30,
                    'Two PRs have waited more than two days: #412 (session cleanup) and #418 (reply lines). Both need one more approval.'
                ),
                agent(
                    ids.stacked,
                    blippyId,
                    40,
                    'Monday checklist: changelog drafted, iOS build pending, release notes need an owner.'
                ),
                agent(
                    ids.trigger,
                    tinyId,
                    60,
                    'Production deploy finished in 2m 41s. Error rate is back to baseline.'
                ),
                agent(
                    ids.archived,
                    blippyId,
                    75,
                    'Archived the four design threads nobody touched last week.'
                ),
            ],
            serverId,
        });
        await markReply(tx, { messageId: ids.plainReply, parentId: ids.askReviews, serverId });
        await markReply(tx, { messageId: ids.stacked, parentId: ids.askChecklist, serverId });

        const reminder = (anchorMessageId: string) => ({ anchorChatId: chatId, anchorMessageId });
        const reviews = await seedReminderFire(tx, {
            ...reminder(ids.askReviews),
            firedAt: at(29),
            ownerAgentId: blippyId,
            repeat: null,
            script: 'Summarize open PRs waiting on review for more than two days.',
            serverId,
            status: 'fired',
            title: 'Check the open pull requests in grotto and summarize anything blocked on review for more than two days',
        });
        const checklist = await seedReminderFire(tx, {
            ...reminder(ids.askChecklist),
            firedAt: at(39),
            ownerAgentId: blippyId,
            repeat: 'weekly:mon@09:00',
            script: null,
            serverId,
            status: 'scheduled',
            title: 'Run the Monday release checklist and name an owner for every unchecked item',
        });
        const stale = await seedReminderFire(tx, {
            ...reminder(ids.askReviews),
            firedAt: at(74),
            ownerAgentId: blippyId,
            repeat: null,
            script: null,
            serverId,
            status: 'fired',
            title: "Archive last week's stale design threads",
        });
        const deploy = await seedTriggerFire(tx, {
            anchorChatId: chatId,
            firedAt: at(59),
            ownerAgentId: tinyId,
            serverId,
            title: 'Deploy finished',
            userId,
        });

        for (const [messageId, fireId, agentId] of [
            [ids.alone, reviews.fireId, blippyId],
            [ids.stacked, checklist.fireId, blippyId],
            [ids.trigger, deploy, tinyId],
            [ids.archived, stale.fireId, blippyId],
        ] as const) {
            const cause = await resolveMessageCause(tx, { agentId, cause: fireId, serverId });
            await insertMessageCause(tx, { attribution: 'explicit', cause, messageId, serverId });
        }
        // Deleting the Reminder after its cause is recorded is how one is archived:
        // the cause keeps its snapshot and loses only its live half.
        await tx
            .delete(remindersTable)
            .where(and(eq(remindersTable.serverId, serverId), eq(remindersTable.id, stale.id)));
    });
}

async function markReply(
    tx: HausDatabase,
    input: { messageId: string; parentId: string; serverId: string }
) {
    await tx
        .update(chatMessagesTable)
        .set({ replyRootMessageId: input.parentId, replyToMessageId: input.parentId })
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.id, input.messageId)
            )
        );
}

async function seedReminderFire(
    tx: HausDatabase,
    input: {
        anchorChatId: string;
        anchorMessageId: string;
        firedAt: Date;
        ownerAgentId: string;
        repeat: string | null;
        script: string | null;
        serverId: string;
        status: 'fired' | 'scheduled';
        title: string;
    }
) {
    const id = createOpaqueId('rem');
    const fireId = createOpaqueId('rmf');
    const { firedAt, ...reminder } = input;
    const createdAt = new Date(firedAt.getTime() - 20 * minuteMs);
    await tx.insert(remindersTable).values({
        ...reminder,
        createdAt,
        // A scheduled repeat's next fire is a week out; a fired one-time keeps its fire time.
        fireAt: input.status === 'scheduled' ? new Date(Date.now() + 7 * 86_400_000) : firedAt,
        id,
        timezone: 'America/New_York',
        updatedAt: firedAt,
    });
    await tx.insert(reminderFiresTable).values({
        firedAt,
        hasScript: input.script !== null,
        id: fireId,
        reminderId: id,
        scheduledFor: firedAt,
        serverId: input.serverId,
    });
    return { fireId, id };
}

async function seedTriggerFire(
    tx: HausDatabase,
    input: {
        anchorChatId: string;
        firedAt: Date;
        ownerAgentId: string;
        serverId: string;
        title: string;
        userId: string;
    }
) {
    const id = createOpaqueId('trg');
    const fireId = createOpaqueId('trf');
    const payload = JSON.stringify({ durationSeconds: 161, environment: 'production' });
    await tx.insert(triggersTable).values({
        anchorChatId: input.anchorChatId,
        anchorMessageId: null,
        createdAt: new Date(input.firedAt.getTime() - 86_400_000),
        createdByUserId: input.userId,
        fireCount: 1,
        id,
        instruction: 'Summarize the deploy in #automations; flag failures.',
        kind: 'webhook',
        lastFiredAt: input.firedAt,
        ownerAgentId: input.ownerAgentId,
        // Discarded: nothing outside this seed can fire the sample Trigger.
        secretHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        serverId: input.serverId,
        status: 'armed',
        title: input.title,
        updatedAt: input.firedAt,
    });
    await tx.insert(triggerFiresTable).values({
        contentType: 'application/json',
        id: fireId,
        payload,
        payloadBytes: Buffer.byteLength(payload),
        receivedAt: input.firedAt,
        serverId: input.serverId,
        triggerId: id,
    });
    return fireId;
}
