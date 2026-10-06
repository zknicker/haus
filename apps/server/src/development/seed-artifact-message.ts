import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import {
    developmentArtifactFiles,
    developmentArtifactMessageContent,
} from './seed-artifact-files.ts';
import { recordSeedMessageEvents } from './seed-message-events.ts';

const seedNonce = 'dev-artifact-tabs';

/**
 * Keeps one Blippy message in #product that shares real workspace artifacts, so
 * artifact cards, `haus://workspace` links, and desktop artifact tabs have
 * something to open. Idempotent, and it runs for existing dev workspaces too.
 * The files go straight into Blippy's workspace on the dev Computer's data
 * root, the same dev-only shortcut the Computer attachment seed takes.
 */
export async function ensureDevelopmentArtifactMessage(
    db: HausDatabase,
    input: { computerDataRoot?: string; serverId: string }
) {
    const agentId = await db.transaction(async (tx) => {
        const [agent] = await tx
            .select({ id: agentsTable.id })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.handle, 'blippy'),
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1);
        if (!agent) {
            throw new Error('The development artifact message needs Blippy.');
        }
        const [chat] = await tx
            .select({ id: chatsTable.id, lastMessageSequence: chatsTable.lastMessageSequence })
            .from(chatsTable)
            .where(
                and(
                    eq(chatsTable.serverId, input.serverId),
                    eq(chatsTable.kind, 'channel'),
                    eq(chatsTable.name, 'product')
                )
            )
            .limit(1)
            .for('update');
        if (!chat) {
            throw new Error('The development artifact message needs the #product Chat.');
        }
        const [existing] = await tx
            .select({ id: chatMessagesTable.id })
            .from(chatMessagesTable)
            .where(
                and(eq(chatMessagesTable.chatId, chat.id), eq(chatMessagesTable.nonce, seedNonce))
            )
            .limit(1);
        if (existing) {
            return agent.id;
        }

        const messageId = createOpaqueId('msg');
        // The next real send takes `lastMessageSequence + 1`, so advance it with the row.
        const sequence = chat.lastMessageSequence + 1;
        await tx.insert(chatMessagesTable).values({
            authorAgentId: agent.id,
            chatId: chat.id,
            content: developmentArtifactMessageContent,
            id: messageId,
            nonce: seedNonce,
            replyRootMessageId: messageId,
            sequence,
            serverId: input.serverId,
        });
        await recordSeedMessageEvents(tx, input.serverId, [
            { chatId: chat.id, id: messageId, sequence },
        ]);
        await tx
            .update(chatsTable)
            .set({ lastActivityAt: new Date(), lastMessageSequence: sequence })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, chat.id)));
        return agent.id;
    });

    if (input.computerDataRoot) {
        await ensureWorkspaceFiles(
            join(input.computerDataRoot, 'servers', input.serverId, 'agents', agentId, 'workspace')
        );
    }
}

/** Writes each seeded file only when absent, so an Agent's own edits survive reseeding. */
async function ensureWorkspaceFiles(workspace: string) {
    for (const file of Object.values(developmentArtifactFiles)) {
        const target = join(workspace, file.path);
        await mkdir(dirname(target), { mode: 0o700, recursive: true });
        try {
            await writeFile(target, file.content, { flag: 'wx', mode: 0o600 });
        } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
                throw error;
            }
        }
    }
}
