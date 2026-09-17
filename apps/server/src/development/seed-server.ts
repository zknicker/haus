import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computerProtocolVersion, hausAgentVersion } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    agentTokenUsageDailyTable,
    channelAgentParticipantsTable,
    channelParticipantsTable,
    chatMessagesTable,
    chatsTable,
    computersTable,
    mcpConnectionsTable,
    messageTasksTable,
    serverMembershipsTable,
    serverOnboardingTable,
    serversTable,
    threadFollowsTable,
    usersTable,
} from '../postgres/schema.ts';
import { listAccessibleServers } from '../servers/accessible-servers.ts';
import type { ServerSummary } from '../servers/contracts.ts';
import { ensureUserByClerkId } from '../users/haus-user.ts';
import { demoTokenUsage } from './demo-token-usage.ts';
import { ensureDevelopmentChatAttachment } from './seed-chat-attachment.ts';
import { ensureDevelopmentCove } from './seed-cove.ts';
import { insertSeedAvatars } from './seed-demo-avatars.ts';
import { seedDevelopmentInboxActivity } from './seed-inbox-activity.ts';
import { seedDevelopmentUiGallery } from './seed-ui-gallery.ts';

const demoInventory = {
    name: 'Development Mac',
    runtimes: [
        {
            id: 'codex',
            label: 'Codex',
            models: [
                { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
                { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
            ],
        },
    ],
};

/** Creates the one idempotent Server-owned demo workspace for a signed-in dev user. */
export async function seedDevelopmentServer(
    db: HausDatabase,
    clerkUserId: string,
    options: {
        attachmentRoot?: AttachmentRoot;
        computerDataRoot?: string;
        serverOrigin?: string;
    } = {}
): Promise<ServerSummary> {
    const user = await ensureUserByClerkId(db, clerkUserId);
    const existing = await listAccessibleServers(db, user.id);
    if (existing[0]) {
        await ensureDevelopmentCove(db, { serverId: existing[0].id, userId: user.id });
        await ensureDevelopmentComputerAttachment(db, existing[0], options);
        if (options.attachmentRoot) {
            await ensureDevelopmentChatAttachment(db, options.attachmentRoot, existing[0].id);
        }
        await seedDevelopmentInboxActivity(db, { serverId: existing[0].id, userId: user.id });
        await seedDevelopmentUiGallery(db, { serverId: existing[0].id, userId: user.id });
        return existing[0];
    }

    const seeded = await db.transaction(async (tx) => {
        const serverId = createOpaqueId('srv');
        const membershipId = createOpaqueId('mem');
        const channelId = createOpaqueId('cht');
        const demoChannelId = createOpaqueId('cht');
        const onboardingChannelId = createOpaqueId('cht');
        const blippyDmId = createOpaqueId('cht');
        const tinyDmId = createOpaqueId('cht');
        const computerId = createOpaqueId('cmp');
        const blippyId = createOpaqueId('agt');
        const tinyId = createOpaqueId('agt');
        const mcpId = createOpaqueId('mcp');
        const now = new Date();
        // Messages that later rows point at need stable ids, so mint them up front.
        const planMessageId = createOpaqueId('msg');
        const shipTaskMessageId = createOpaqueId('msg');
        const auditTaskMessageId = createOpaqueId('msg');
        const threadChatId = demoThreadId(planMessageId);
        const avatarIds = await insertSeedAvatars(tx);

        await tx.insert(serversTable).values({
            displayName: 'Dev Server',
            id: serverId,
            slug: 'dev',
        });
        await tx.insert(serverMembershipsTable).values({
            id: membershipId,
            role: 'owner',
            serverId,
            userId: user.id,
        });
        await tx
            .update(usersTable)
            .set({ avatarId: avatarIds.owner })
            .where(eq(usersTable.id, user.id));
        // Two tasks in different states, one per assignee kind. The channel's
        // task counter starts past them, or the first real `task.promote` in a
        // seeded workspace collides with a seeded number.
        const demoTasks = [
            {
                assigneeAgentId: blippyId,
                chatId: channelId,
                createdByUserId: user.id,
                messageId: shipTaskMessageId,
                number: 1,
                origin: 'composed' as const,
                priority: 'high' as const,
                serverId,
                status: 'in_progress' as const,
            },
            {
                assigneeUserId: user.id,
                chatId: channelId,
                createdByAgentId: tinyId,
                messageId: auditTaskMessageId,
                number: 2,
                origin: 'converted' as const,
                priority: 'medium' as const,
                serverId,
                status: 'todo' as const,
            },
        ];
        await tx.insert(chatsTable).values({
            id: channelId,
            isAll: true,
            kind: 'channel',
            lastActivityAt: now,
            lastMessageSequence: 6,
            lastTaskNumber: Math.max(...demoTasks.map((task) => task.number)),
            name: 'all',
            serverId,
        });
        await tx.insert(chatsTable).values({
            id: onboardingChannelId,
            kind: 'channel',
            name: 'onboarding-owner',
            serverId,
        });
        await tx.insert(chatsTable).values({
            id: demoChannelId,
            kind: 'channel',
            lastActivityAt: now,
            lastMessageSequence: 2,
            name: 'product',
            serverId,
        });
        await tx.insert(channelParticipantsTable).values(
            [channelId, demoChannelId, onboardingChannelId].map((chatId) => ({
                chatId,
                serverId,
                userId: user.id,
            }))
        );
        await tx.insert(computersTable).values({
            architecture: process.arch,
            attachedByUserId: user.id,
            credentialHash: hash(developmentComputerCredential(serverId, computerId)),
            health: 'offline',
            id: computerId,
            operatingSystem: process.platform,
            productVersion: 'dev',
            protocolVersion: computerProtocolVersion,
            reportedInventory: demoInventory,
            serverId,
        });
        await tx.insert(serverOnboardingTable).values({
            channelId: onboardingChannelId,
            computerId,
            phase: 'complete',
            serverId,
        });
        await tx.insert(agentsTable).values([
            demoAgent({
                avatarId: avatarIds.blippy,
                computerId,
                createdByUserId: user.id,
                description: 'Keeps the plan tight and surfaces decisions early.',
                displayName: 'Blippy',
                handle: 'blippy',
                id: blippyId,
                modelId: 'gpt-5.6-sol',
                reportedAt: now,
                serverId,
            }),
            demoAgent({
                avatarId: avatarIds.tiny,
                computerId,
                createdByUserId: user.id,
                description: 'Pressure-tests the details and keeps the work grounded.',
                displayName: 'Tiny',
                handle: 'tiny',
                id: tinyId,
                modelId: 'gpt-5.6-terra',
                reportedAt: now,
                serverId,
            }),
        ]);
        await tx
            .insert(chatsTable)
            .values([
                demoAgentDm(blippyDmId, blippyId, serverId, user.id, now, 1),
                demoAgentDm(tinyDmId, tinyId, serverId, user.id, now, 1),
            ]);
        await tx.insert(channelAgentParticipantsTable).values([
            { agentId: blippyId, chatId: channelId, serverId },
            { agentId: tinyId, chatId: channelId, serverId },
            { agentId: blippyId, chatId: demoChannelId, serverId },
            { agentId: tinyId, chatId: demoChannelId, serverId },
        ]);
        await tx.insert(chatMessagesTable).values([
            demoMessage(serverId, channelId, 1, {
                authorUserId: user.id,
                content: 'Morning team — what should we focus on today?',
            }),
            demoMessage(serverId, channelId, 2, {
                authorAgentId: blippyId,
                content: 'I’ll keep the plan tight and surface decisions early.',
            }),
            demoMessage(serverId, channelId, 3, {
                authorAgentId: tinyId,
                content: 'I’ll pressure-test the details and keep the work grounded.',
            }),
            demoMessage(
                serverId,
                channelId,
                4,
                {
                    authorUserId: user.id,
                    content: 'Here’s the plan for the week — shout if anything looks wrong.',
                },
                planMessageId
            ),
            demoMessage(
                serverId,
                channelId,
                5,
                {
                    authorUserId: user.id,
                    content: 'Ship the avatar upload flow end to end.',
                },
                shipTaskMessageId
            ),
            demoMessage(
                serverId,
                channelId,
                6,
                {
                    authorAgentId: tinyId,
                    content: 'Audit the member directory for stale copy.',
                },
                auditTaskMessageId
            ),
            demoMessage(serverId, demoChannelId, 1, {
                authorUserId: user.id,
                content: 'What should we polish next?',
            }),
            demoMessage(serverId, demoChannelId, 2, {
                authorAgentId: blippyId,
                content: 'The core flow first. Everything else earns its way in.',
            }),
            demoMessage(serverId, blippyDmId, 1, {
                authorAgentId: blippyId,
                content: 'Blippy online. What are we building?',
            }),
            demoMessage(serverId, tinyDmId, 1, {
                authorAgentId: tinyId,
                content: 'Tiny here. Send me the sharp edges.',
            }),
        ]);

        // Every task carries its deterministic Thread, and the plan message has
        // a discussion thread the author follows.
        await tx
            .insert(chatsTable)
            .values([
                demoThread(serverId, channelId, planMessageId, now, 3),
                demoThread(serverId, channelId, shipTaskMessageId, now, 0),
                demoThread(serverId, channelId, auditTaskMessageId, now, 0),
            ]);
        await tx.insert(threadFollowsTable).values({
            followed: true,
            serverId,
            threadChatId,
            userId: user.id,
        });

        await tx.insert(chatMessagesTable).values([
            demoMessage(serverId, threadChatId, 1, {
                authorAgentId: blippyId,
                content: 'Reading it now — the sequencing looks right to me.',
            }),
            demoMessage(serverId, threadChatId, 2, {
                authorAgentId: tinyId,
                content: 'One risk: the upload path needs a size cap before we ship it.',
            }),
            demoMessage(serverId, threadChatId, 3, {
                authorUserId: user.id,
                content: 'Good catch — folding that in.',
            }),
        ]);

        // Two tasks in different states, one per assignee kind.
        await tx.insert(messageTasksTable).values(demoTasks);

        // One Server-managed MCP connection so the Agent Connections surface
        // has something to grant.
        await tx.insert(mcpConnectionsTable).values({
            auth: 'none',
            connected: true,
            headerNames: [],
            id: mcpId,
            name: 'Demo Tools',
            serverId,
            tools: ['search_docs', 'fetch_page'],
            url: 'https://example.invalid/mcp',
        });

        // Ninety days of usage populate every dashboard range.
        await tx.insert(agentTokenUsageDailyTable).values(
            demoTokenUsage(serverId, now, [
                { id: blippyId, modelId: 'gpt-5.6-sol', weight: 1 },
                { id: tinyId, modelId: 'gpt-5.6-terra', weight: 0.55 },
            ])
        );

        return { displayName: 'Dev Server', id: serverId, role: 'owner' as const, slug: 'dev' };
    });
    await ensureDevelopmentCove(db, { serverId: seeded.id, userId: user.id });
    await ensureDevelopmentComputerAttachment(db, seeded, options);
    if (options.attachmentRoot) {
        await ensureDevelopmentChatAttachment(db, options.attachmentRoot, seeded.id);
    }
    await seedDevelopmentInboxActivity(db, { serverId: seeded.id, userId: user.id });
    await seedDevelopmentUiGallery(db, { serverId: seeded.id, userId: user.id });
    return seeded;
}

async function ensureDevelopmentComputerAttachment(
    db: HausDatabase,
    server: ServerSummary,
    options: { computerDataRoot?: string; serverOrigin?: string }
) {
    const computerDataRoot =
        options.computerDataRoot ?? process.env.HAUS_COMPUTER_DATA_ROOT?.trim();
    if (!computerDataRoot) {
        return;
    }
    const [computer] = await db
        .select({ id: computersTable.id })
        .from(computersTable)
        .innerJoin(serverOnboardingTable, eq(serverOnboardingTable.computerId, computersTable.id))
        .where(eq(computersTable.serverId, server.id))
        .limit(1);
    if (!computer) {
        throw new Error('The development Server has no Computer.');
    }
    const credential = developmentComputerCredential(server.id, computer.id);
    await db
        .update(computersTable)
        .set({ credentialHash: hash(credential) })
        .where(eq(computersTable.id, computer.id));

    const directory = join(computerDataRoot, 'servers', server.id);
    const target = join(directory, 'attachment.json');
    const temporary = join(directory, 'attachment.json.tmp');
    await mkdir(directory, { mode: 0o700, recursive: true });
    await writeFile(
        temporary,
        `${JSON.stringify(
            {
                computerId: computer.id,
                credential,
                serverId: server.id,
                serverOrigin:
                    options.serverOrigin ??
                    process.env.HAUS_SERVER_ORIGIN ??
                    `http://127.0.0.1:${process.env.HAUS_SERVER_PORT ?? '18791'}`,
                slug: server.slug,
            },
            null,
            2
        )}\n`,
        { mode: 0o600 }
    );
    await rename(temporary, target);
}

function developmentComputerCredential(serverId: string, computerId: string) {
    return `dev-computer:${serverId}:${computerId}:local-only`;
}

function hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

/** Mirrors the deterministic anchor id used by `ensureThread`. */
function demoThreadId(anchorMessageId: string) {
    return `cht_thr_${anchorMessageId.replace(/^msg_/u, '')}`;
}

function demoThread(
    serverId: string,
    parentChatId: string,
    anchorMessageId: string,
    lastActivityAt: Date,
    lastMessageSequence: number
) {
    return {
        anchorMessageId,
        id: demoThreadId(anchorMessageId),
        kind: 'thread' as const,
        lastActivityAt,
        lastMessageSequence,
        parentChatId,
        parentChatKind: 'channel' as const,
        serverId,
    };
}

function demoAgentDm(
    id: string,
    agentId: string,
    serverId: string,
    userId: string,
    lastActivityAt: Date,
    lastMessageSequence: number
) {
    return {
        dmAgentId: agentId,
        dmMemberOneStint: 1,
        dmMemberOneUserId: userId,
        id,
        kind: 'dm' as const,
        lastActivityAt,
        lastMessageSequence,
        serverId,
    };
}

function demoAgent(agent: {
    avatarId: string;
    computerId: string;
    createdByUserId: string;
    description: string;
    displayName: string;
    handle: string;
    id: string;
    modelId: string;
    reportedAt: Date;
    serverId: string;
}) {
    return {
        avatarId: agent.avatarId,
        computerId: agent.computerId,
        createdByUserId: agent.createdByUserId,
        desiredModelId: agent.modelId,
        desiredRuntimeId: 'codex',
        description: agent.description,
        displayName: agent.displayName,
        effectiveHausAgentAppliedAt: agent.reportedAt,
        effectiveHausAgentStatus: 'current' as const,
        effectiveHausAgentVersion: hausAgentVersion,
        effectiveMissing: [],
        effectiveModelId: agent.modelId,
        effectiveReasoningEffort: 'medium' as const,
        effectiveReportedAt: agent.reportedAt,
        effectiveRuntimeId: 'codex',
        handle: agent.handle,
        homeTimezone: 'America/New_York',
        id: agent.id,
        serverId: agent.serverId,
    };
}

function demoMessage(
    serverId: string,
    chatId: string,
    sequence: number,
    author: { authorAgentId: string; content: string } | { authorUserId: string; content: string },
    id = createOpaqueId('msg')
) {
    return {
        ...author,
        chatId,
        id,
        nonce: `dev-${chatId}-${sequence}`,
        replyRootMessageId: id,
        sequence,
        serverId,
    };
}
