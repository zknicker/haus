import { formatUserReferenceTarget } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatMessagesTable, serverMembershipsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { seedAgentTurns } from './seed-agent-turns.ts';
import { findInboxSeedContext, type InboxSeedContext } from './seed-inbox-context.ts';
import { appendSeedMessages, backdateSeedHistory } from './seed-inbox-messages.ts';
import { seedCloudAgentWork, seedStalledClaim } from './seed-inbox-records.ts';

/** The oldest Message this seed writes; its nonce is the whole seed's marker. */
const claimRequestNonce = 'dev-inbox-claim-request';

const minute = 60_000;
const hour = 60 * minute;

/**
 * Gives the demo workspace the activity the human Inbox is a lens over: unread
 * conversations with a last line (Tiny's DM question among them), Cove's
 * @mention of the owner, a claim an Agent left behind,
 * one settled Cloud Agent work, and a week of Agent turns. Every row is shaped
 * the way the product writes it, so the page can be judged from a fresh boot
 * without hand-building data.
 *
 * One transaction, marked by the first Message's nonce: a restart re-runs this
 * and writes nothing, and a failure anywhere leaves the workspace untouched
 * rather than half-populated.
 */
export async function seedDevelopmentInboxActivity(
    db: HausDatabase,
    input: { serverId: string; userId: string }
): Promise<void> {
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (await alreadySeeded(tx, input.serverId)) {
            return;
        }
        const context = await findInboxSeedContext(tx, input);
        if (!context) {
            return;
        }
        const now = new Date();

        const claimAnchorMessageId = await seedAllChannelActivity(tx, context, now);
        await seedStalledClaim(tx, context, {
            anchorMessageId: claimAnchorMessageId,
            claimedAt: before(now, 5 * hour + 40 * minute),
            trackedAt: before(now, 4 * hour),
        });
        await seedProductChannelActivity(tx, context, now);
        await seedDirectMessageActivity(tx, context, now);
        await seedCoveMention(tx, context, before(now, 55 * minute));
        await seedAgentTurns(tx, context, now);
    });
}

/**
 * The morning's #all: a request nobody promoted, Blippy's claim on it, and the
 * badge work it drifted into. The claim's anchor id is minted here because the
 * task row points at it.
 */
async function seedAllChannelActivity(
    tx: HausDatabase,
    context: InboxSeedContext,
    now: Date
): Promise<string> {
    await backdateSeedHistory(tx, {
        chatId: context.allChatId,
        serverId: context.serverId,
        until: before(now, 6 * hour),
    });
    const claimAnchorMessageId = createOpaqueId('msg');
    await appendSeedMessages(tx, {
        chatId: context.allChatId,
        messages: [
            {
                authorUserId: context.userId,
                content:
                    'Reminders on the weekly digest fired twice this morning — can someone take it?',
                createdAt: before(now, 6 * hour),
                id: claimAnchorMessageId,
                nonce: claimRequestNonce,
            },
            {
                authorAgentId: context.blippyId,
                content: 'Taking the duplicate digest reminders.',
                createdAt: before(now, 5 * hour + 40 * minute),
                nonce: 'dev-inbox-claim-ack',
            },
            {
                authorAgentId: context.blippyId,
                content:
                    'Sidebar badge count was reading the cached chat row instead of the read cursor.',
                createdAt: before(now, 3 * hour),
                nonce: 'dev-inbox-badge-cause',
            },
            {
                authorAgentId: context.blippyId,
                content: 'Pushed the sidebar badge fix — PR is up for a look.',
                createdAt: before(now, 18 * minute),
                nonce: 'dev-inbox-badge-shipped',
            },
        ],
        serverId: context.serverId,
    });
    return claimAnchorMessageId;
}

/**
 * Cove asks the owner by @mention where the work lives (ADR 0037). There is no
 * question record; the reply is the answer.
 */
async function seedCoveMention(tx: HausDatabase, context: InboxSeedContext, at: Date) {
    const [owner] = await tx
        .select({ handle: serverMembershipsTable.handle })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, context.serverId),
                eq(serverMembershipsTable.userId, context.userId)
            )
        )
        .limit(1);
    const mention = `[@${owner?.handle ?? 'owner'}](${formatUserReferenceTarget(context.userId)})`;
    await backdateSeedHistory(tx, {
        chatId: context.onboardingChatId,
        serverId: context.serverId,
        until: at,
    });
    await appendSeedMessages(tx, {
        chatId: context.onboardingChatId,
        messages: [
            {
                authorAgentId: context.coveId,
                content: `${mention} Rename #product to #build? Two agents keep filing build questions in #product, and the new name makes the channel’s job obvious. Reply yes and I’ll rename it; nothing changes until you do.`,
                createdAt: at,
                nonce: 'dev-inbox-mention-rename-product',
            },
        ],
        serverId: context.serverId,
    });
}

/** #product: yesterday's settled Cloud Agent work and Tiny's rename nudge. */
async function seedProductChannelActivity(
    tx: HausDatabase,
    context: InboxSeedContext,
    now: Date
): Promise<void> {
    await backdateSeedHistory(tx, {
        chatId: context.productChatId,
        serverId: context.serverId,
        until: before(now, 27 * hour),
    });
    // Only settled work is seeded. Computer reconciles running Cloud Agent work
    // against the provider every minute, so a fake run fails that loop forever
    // and its retries reserve every Server database connection until the pool
    // wedges. An empty Happening now on a fresh boot is the honest state.
    await seedCloudAgentWork(tx, context, {
        activityAt: before(now, 25 * hour + 10 * minute),
        activitySummary: 'Opened the pull request for review.',
        content: 'Sending the sidebar Inbox badge to a cloud agent.',
        createdAt: before(now, 26 * hour),
        nonce: 'dev-inbox-cloud-badge',
        providerAgentId: 'bc_dev_sidebar_badge',
        providerRunId: 'run_dev_sidebar_badge',
        rawStatus: 'FINISHED',
        runSummary:
            'Added the Inbox badge and its unread rollup, and opened the pull request for review.',
        startedAt: before(now, 25 * hour + 50 * minute),
        terminalAt: before(now, 25 * hour + 10 * minute),
        title: 'Sidebar Inbox badge',
    });
    await appendSeedMessages(tx, {
        chatId: context.productChatId,
        messages: [
            {
                authorAgentId: context.tinyId,
                content:
                    'Two build questions landed here again; see the thread for the rename idea.',
                createdAt: before(now, 6 * minute),
                nonce: 'dev-inbox-product-rename',
            },
        ],
        serverId: context.serverId,
    });
}

/**
 * Blippy's DM: an Agent line the owner already answered. Tiny's DM: an
 * unanswered question.
 */
async function seedDirectMessageActivity(
    tx: HausDatabase,
    context: InboxSeedContext,
    now: Date
): Promise<void> {
    const blippyAt = before(now, 2 * hour + 30 * minute);
    const tinyAt = before(now, 45 * minute);
    await backdateSeedHistory(tx, {
        chatId: context.blippyDmChatId,
        serverId: context.serverId,
        until: blippyAt,
    });
    await appendSeedMessages(tx, {
        chatId: context.blippyDmChatId,
        messages: [
            {
                authorAgentId: context.blippyId,
                content:
                    'The duplicate digest reminders are still open on my side — picking them back up after the badge PR.',
                createdAt: blippyAt,
                nonce: 'dev-inbox-blippy-dm',
            },
            {
                authorUserId: context.userId,
                content: 'Sounds right — badge PR first, then the reminders.',
                createdAt: new Date(blippyAt.getTime() + 4 * minute),
                nonce: 'dev-inbox-blippy-dm-reply',
            },
        ],
        serverId: context.serverId,
    });
    await backdateSeedHistory(tx, {
        chatId: context.tinyDmChatId,
        serverId: context.serverId,
        until: tinyAt,
    });
    await appendSeedMessages(tx, {
        chatId: context.tinyDmChatId,
        messages: [
            {
                authorAgentId: context.tinyId,
                content:
                    'Finished the member-directory audit. Three stale strings, listed in the thread.',
                createdAt: tinyAt,
                nonce: 'dev-inbox-tiny-dm',
            },
            {
                authorAgentId: context.tinyId,
                content:
                    'Which of the three stale strings should I fix first? I can fold the rest into the same PR once I know where to start.',
                createdAt: new Date(tinyAt.getTime() + 33 * minute),
                nonce: 'dev-inbox-tiny-stale-copy',
            },
        ],
        serverId: context.serverId,
    });
}

async function alreadySeeded(tx: HausDatabase, serverId: string): Promise<boolean> {
    const [marker] = await tx
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                eq(chatMessagesTable.nonce, claimRequestNonce)
            )
        )
        .limit(1);
    return marker !== undefined;
}

function before(now: Date, milliseconds: number): Date {
    return new Date(now.getTime() - milliseconds);
}
