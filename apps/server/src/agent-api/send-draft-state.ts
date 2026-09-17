import { and, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMessageDraftsTable } from '../postgres/schema.ts';
import { AgentSendModeError } from './send-mode-validation.ts';

const draftTtlMs = 10 * 60 * 1000;

export async function clearAgentDraft(db: HausDatabase, runner: ResolvedRunner, chatId: string) {
    await db
        .delete(agentMessageDraftsTable)
        .where(
            and(
                eq(agentMessageDraftsTable.serverId, runner.serverId),
                eq(agentMessageDraftsTable.agentId, runner.agentId),
                eq(agentMessageDraftsTable.chatId, chatId)
            )
        );
}

export async function readDraft(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    generation: number
) {
    const [draft] = await db
        .select()
        .from(agentMessageDraftsTable)
        .where(
            and(
                eq(agentMessageDraftsTable.serverId, runner.serverId),
                eq(agentMessageDraftsTable.agentId, runner.agentId),
                eq(agentMessageDraftsTable.sessionGeneration, generation),
                eq(agentMessageDraftsTable.chatId, chatId)
            )
        )
        .limit(1);
    if (!draft) {
        return null;
    }
    if (Date.now() - draft.savedAt.getTime() >= draftTtlMs) {
        await clearAgentDraft(db, runner, chatId);
        return null;
    }
    return draft;
}

export async function saveDraft(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    generation: number,
    draft: {
        attachmentIds: string[];
        content: string;
        reholdCount: number;
        replyToMessageId?: string;
    }
) {
    await db
        .insert(agentMessageDraftsTable)
        .values({
            agentId: runner.agentId,
            attachmentIds: draft.attachmentIds,
            chatId,
            content: draft.content,
            reholdCount: draft.reholdCount,
            replyToMessageId: draft.replyToMessageId ?? null,
            serverId: runner.serverId,
            sessionGeneration: generation,
        })
        .onConflictDoUpdate({
            set: {
                attachmentIds: draft.attachmentIds,
                content: draft.content,
                reholdCount: draft.reholdCount,
                replyToMessageId: draft.replyToMessageId ?? null,
                savedAt: new Date(),
            },
            target: [
                agentMessageDraftsTable.serverId,
                agentMessageDraftsTable.agentId,
                agentMessageDraftsTable.sessionGeneration,
                agentMessageDraftsTable.chatId,
            ],
        });
}

export function requireDraft(draft: Awaited<ReturnType<typeof readDraft>>) {
    if (!draft) {
        throw new AgentSendModeError(
            'No saved draft exists for this target.',
            'SEND_DRAFT_NOT_FOUND',
            404
        );
    }
    return {
        attachmentIds: draft.attachmentIds,
        content: draft.content,
        reholdCount: draft.reholdCount,
        ...(draft.replyToMessageId ? { replyToMessageId: draft.replyToMessageId } : {}),
    };
}
