import { createHash } from 'node:crypto';
import { artifactTextMaxBytes } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { mergeText } from '../drive/text-merge.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { takeNextNumber } from './revision-number.ts';
import type { ArtifactStorage } from './storage.ts';
import { artifactTextFromBytes } from './text.ts';

type Artifact = typeof artifacts.$inferSelect;
type Revision = typeof revisions.$inferSelect;

export type RevisionMerge = Awaited<ReturnType<typeof mergeOntoHead>>;

export async function mergeOntoHead(
    tx: HausDatabase,
    storage: ArtifactStorage,
    write: { artifact: Artifact; base: string; incoming: Revision; incomingSize: number }
) {
    const { artifact } = write;
    const base = await readyRevision(tx, artifact, write.base);
    const head = artifact.currentRevisionId
        ? await readyRevision(tx, artifact, artifact.currentRevisionId)
        : null;
    if (!(base && head)) {
        return conflict('base_gone');
    }
    if (
        [base.byteSize, head.byteSize, write.incomingSize].some(
            (size) => size > artifactTextMaxBytes
        )
    ) {
        return conflict('binary');
    }
    const texts: string[] = [];
    for (const revision of [base, head, write.incoming]) {
        const read = artifactTextFromBytes(
            await storage.read(revision.objectKey, artifactTextMaxBytes + 1),
            'keep'
        );
        if (read.status !== 'text') {
            return conflict('binary');
        }
        texts.push(read.text);
    }
    const [baseText = '', headText = '', incomingText = ''] = texts;
    const merged = mergeText(baseText, headText, incomingText);
    return merged.status === 'merged'
        ? {
              bytes: new TextEncoder().encode(merged.text),
              headNumber: head.revisionNumber,
              headSha256: head.sha256,
              status: 'merged' as const,
          }
        : conflict('same_lines');
}

export async function storeMergedRevision(
    tx: HausDatabase,
    storage: ArtifactStorage,
    write: { artifact: Artifact; bytes: Uint8Array; headNumber: number; revision: Revision }
) {
    const { artifact, bytes, revision } = write;
    await storage.upload(revision.objectKey, single(bytes), revision.contentType);
    const [stored] = await tx
        .update(revisions)
        .set({
            byteSize: bytes.byteLength,
            reservedBytes: bytes.byteLength,
            revisionNumber:
                revision.revisionNumber > write.headNumber
                    ? revision.revisionNumber
                    : await takeNextNumber(tx, artifact.id),
            sha256: createHash('sha256').update(bytes).digest('hex'),
        })
        .where(eq(revisions.id, revision.id))
        .returning();
    if (!stored) {
        throw new Error('Merged revision did not return its row.');
    }
    return stored;
}

function conflict(reason: 'base_gone' | 'binary' | 'same_lines') {
    return { reason, status: 'conflict' as const };
}

async function readyRevision(tx: HausDatabase, artifact: Artifact, revisionId: string) {
    const [row] = await tx
        .select()
        .from(revisions)
        .where(
            and(
                eq(revisions.serverId, artifact.serverId),
                eq(revisions.artifactId, artifact.id),
                eq(revisions.id, revisionId),
                eq(revisions.state, 'ready')
            )
        )
        .limit(1);
    return row ?? null;
}

async function* single(bytes: Uint8Array) {
    yield bytes;
}
