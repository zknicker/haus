import { artifactPathKey, type DriveCitation } from '@haus/api';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable,
    chatMessagesTable,
    messageDriveCitationsTable,
} from '../postgres/schema.ts';
import { readDriveCitationPaths } from './citation-links.ts';

type Reader = Pick<HausDatabase, 'select'>;

export interface DriveCitationBinding {
    artifactId: string;
    revisionId: string;
}

export async function recordDriveCitations(
    tx: Pick<HausDatabase, 'insert' | 'select'>,
    input: { content: string; messageId: string; serverId: string }
) {
    const citations = await resolveDriveCitations(tx, input);
    if (citations.length > 0) {
        await tx.insert(messageDriveCitationsTable).values(
            citations.map((citation, ordinal) => ({
                ...citation,
                messageId: input.messageId,
                ordinal,
                serverId: input.serverId,
            }))
        );
    }
    return citations;
}

export async function rebindPushCitations(
    tx: Pick<HausDatabase, 'select' | 'update'>,
    input: {
        agentId: string;
        bindings: ReadonlyMap<string, DriveCitationBinding>;
        pushId: string;
        serverId: string;
    }
) {
    if (input.bindings.size === 0) {
        return [];
    }
    const bindingByKey = new Map(
        [...input.bindings].map(([path, binding]) => [artifactPathKey(path), binding])
    );
    const cited = await tx
        .select({
            artifactId: messageDriveCitationsTable.artifactId,
            messageId: messageDriveCitationsTable.messageId,
            ordinal: messageDriveCitationsTable.ordinal,
            path: messageDriveCitationsTable.path,
            revisionId: messageDriveCitationsTable.revisionId,
        })
        .from(messageDriveCitationsTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, messageDriveCitationsTable.serverId),
                eq(chatMessagesTable.id, messageDriveCitationsTable.messageId)
            )
        )
        .where(
            and(
                eq(messageDriveCitationsTable.serverId, input.serverId),
                eq(chatMessagesTable.runId, input.pushId),
                eq(chatMessagesTable.authorAgentId, input.agentId)
            )
        );
    const moved = cited.flatMap((citation) => {
        const binding = bindingByKey.get(artifactPathKey(citation.path));
        return binding &&
            (binding.artifactId !== citation.artifactId ||
                binding.revisionId !== citation.revisionId)
            ? [{ ...citation, ...binding }]
            : [];
    });
    for (const citation of moved) {
        await tx
            .update(messageDriveCitationsTable)
            .set({ artifactId: citation.artifactId, revisionId: citation.revisionId })
            .where(
                and(
                    eq(messageDriveCitationsTable.serverId, input.serverId),
                    eq(messageDriveCitationsTable.messageId, citation.messageId),
                    eq(messageDriveCitationsTable.ordinal, citation.ordinal)
                )
            );
    }
    return [...new Set(moved.map((citation) => citation.messageId))];
}

export async function readMessageDriveCitations(
    db: Reader,
    serverId: string,
    messageIds: readonly string[]
) {
    const byMessage = new Map<string, DriveCitation[]>();
    if (messageIds.length === 0) {
        return byMessage;
    }
    const rows = await db
        .select({
            artifactId: messageDriveCitationsTable.artifactId,
            messageId: messageDriveCitationsTable.messageId,
            path: messageDriveCitationsTable.path,
            revisionId: messageDriveCitationsTable.revisionId,
        })
        .from(messageDriveCitationsTable)
        .where(
            and(
                eq(messageDriveCitationsTable.serverId, serverId),
                inArray(messageDriveCitationsTable.messageId, [...messageIds])
            )
        )
        .orderBy(
            asc(messageDriveCitationsTable.messageId),
            asc(messageDriveCitationsTable.ordinal)
        );
    for (const { messageId, ...citation } of rows) {
        byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), citation]);
    }
    return byMessage;
}

async function resolveDriveCitations(db: Reader, input: { content: string; serverId: string }) {
    const paths = readDriveCitationPaths(input.content);
    if (paths.length === 0) {
        return [];
    }
    const heads = await db
        .select({
            artifactId: artifactsTable.id,
            pathKey: artifactsTable.pathKey,
            revisionId: artifactsTable.currentRevisionId,
        })
        .from(artifactsTable)
        .where(
            and(
                eq(artifactsTable.serverId, input.serverId),
                isNull(artifactsTable.deletedAt),
                isNotNull(artifactsTable.currentRevisionId),
                inArray(artifactsTable.pathKey, paths.map(artifactPathKey))
            )
        );
    const headByKey = new Map(heads.map((head) => [head.pathKey, head]));
    return paths.map((path) => {
        const head = headByKey.get(artifactPathKey(path));
        return {
            artifactId: head?.artifactId ?? null,
            path,
            revisionId: head?.revisionId ?? null,
        } satisfies DriveCitation;
    });
}
