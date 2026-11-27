import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { HausDatabase } from '../../postgres/connection.ts';
import {
    agentsTable,
    chatsTable,
    projectsTable,
    remindersTable,
    triggersTable,
} from '../../postgres/schema.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { remindersAnchoredIn } from '../../reminders/anchored-reminders.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { deleteTasksOfRemovedChats } from '../../tasks/task-chat-removal.ts';
import { memberProcedure } from '../server/procedure.ts';

const localhostHostPattern = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u;
const cleanupEvalChatsInputSchema = z.object({
    chatIds: z.array(z.string().min(1)).min(1).max(20),
    serverId: z.string().min(1),
});

interface CleanupEvalChatsDependencies {
    nodeEnvironment?: string;
}

function getDependencies(): CleanupEvalChatsDependencies {
    return { nodeEnvironment: process.env.NODE_ENV };
}

export function createCleanupEvalChatsProcedure(
    getProcedureDependencies: () => CleanupEvalChatsDependencies = getDependencies
) {
    return memberProcedure.input(cleanupEvalChatsInputSchema).mutation(async ({ ctx, input }) => {
        assertEvalCleanupAllowed(ctx.requestHost, getProcedureDependencies());
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);

        const requestedChatIds = [...new Set(input.chatIds)];
        const { deleted, deletedTasks } = await ctx.hausDb.transaction(async (tx) => {
            const taskChats = await tx
                .select({ id: chatsTable.id })
                .from(chatsTable)
                .where(
                    and(
                        eq(chatsTable.serverId, input.serverId),
                        inArray(chatsTable.parentChatId, requestedChatIds)
                    )
                );
            const taskChatIds = taskChats.map((chat) => chat.id);
            const chatIds = [...new Set([...requestedChatIds, ...taskChatIds])];
            await tx
                .delete(remindersTable)
                .where(remindersAnchoredIn(tx, { chatIds, serverId: input.serverId }));
            // Like channel deletion: anchored Triggers, tombstones included, go with the Chats.
            await tx
                .delete(triggersTable)
                .where(
                    and(
                        eq(triggersTable.serverId, input.serverId),
                        inArray(triggersTable.anchorChatId, chatIds)
                    )
                );
            const homed = and(
                eq(agentsTable.serverId, input.serverId),
                inArray(agentsTable.homeProjectId, requestedChatIds)
            );
            const [resident] = await tx
                .select({ id: agentsTable.id })
                .from(agentsTable)
                .where(homed)
                .limit(1);
            if (resident) {
                await tx
                    .update(agentsTable)
                    .set({
                        homeProjectId: await requireOtherProjectId(tx, input.serverId, chatIds),
                    })
                    .where(homed);
            }
            const deletedTasks = await deleteTasksOfRemovedChats(tx, {
                chatIds,
                serverId: input.serverId,
            });
            if (taskChatIds.length > 0) {
                await tx
                    .delete(chatsTable)
                    .where(
                        and(
                            eq(chatsTable.serverId, input.serverId),
                            inArray(chatsTable.id, taskChatIds)
                        )
                    );
            }
            const removed = await tx
                .delete(chatsTable)
                .where(
                    and(
                        eq(chatsTable.serverId, input.serverId),
                        inArray(chatsTable.id, requestedChatIds)
                    )
                )
                .returning({ id: chatsTable.id });
            return {
                deleted: [...removed, ...taskChatIds.map((id) => ({ id }))],
                deletedTasks,
            };
        });
        publishRealtime(deletedTasks.events);
        const deletedChatIds = deleted.map((chat) => chat.id).sort();

        return { count: deletedChatIds.length, deletedChatIds };
    });
}

export const cleanupEvalChatsRoute = createCleanupEvalChatsProcedure();

export function assertEvalCleanupAllowed(
    requestHost: string | null,
    dependencies: CleanupEvalChatsDependencies
) {
    if (dependencies.nodeEnvironment === 'production') {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Agent eval cleanup is unavailable in production.',
        });
    }

    if (!(requestHost && localhostHostPattern.test(requestHost.toLowerCase()))) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Agent eval cleanup is available only from localhost.',
        });
    }
}

async function requireOtherProjectId(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    removedChatIds: readonly string[]
) {
    const [project] = await db
        .select({ id: projectsTable.chatId })
        .from(projectsTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, projectsTable.serverId),
                eq(chatsTable.id, projectsTable.chatId)
            )
        )
        .where(
            and(
                eq(projectsTable.serverId, serverId),
                notInArray(projectsTable.chatId, [...removedChatIds]),
                isNull(chatsTable.archivedAt),
                isNull(chatsTable.deletedAt)
            )
        )
        .orderBy(asc(projectsTable.createdAt), asc(projectsTable.chatId))
        .limit(1);
    if (!project) {
        throw new TRPCError({
            code: 'CONFLICT',
            message:
                'An Agent lives in a cleaned channel and the Server has no other open Project.',
        });
    }
    return project.id;
}
