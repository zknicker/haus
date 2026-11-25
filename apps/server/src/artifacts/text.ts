import { type ArtifactTextResult, artifactTextMaxBytes } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ArtifactActor } from './access.ts';
import { getArtifact } from './read.ts';
import { type ArtifactStorage, requireArtifactStorage } from './storage.ts';

/**
 * One revision's bytes as UTF-8 text for the App's inline preview. The signed
 * R2 link is cross-origin and the private bucket sets no CORS policy, so the
 * Server reads the object itself, under the same membership check as
 * `download`, and only up to `artifactTextMaxBytes`.
 */
export async function readArtifactText(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    storage: ArtifactStorage | null,
    artifactId: string,
    revisionId: string
): Promise<ArtifactTextResult> {
    const { metadata, objectKey } = await getArtifact(db, actor, origin, artifactId, revisionId);
    if (metadata.size_bytes > artifactTextMaxBytes) {
        return tooLarge;
    }
    // One byte past the cap proves an object larger than its recorded size.
    const bytes = await requireArtifactStorage(storage).read(objectKey, artifactTextMaxBytes + 1);
    return artifactTextFromBytes(bytes);
}

/**
 * Decode strictly: a NUL byte or invalid UTF-8 means the file is not text. `bom: 'keep'` leaves a
 * leading byte order mark in the text, so a merge writes it back.
 */
export function artifactTextFromBytes(
    bytes: Uint8Array,
    bom: 'keep' | 'strip' = 'strip'
): ArtifactTextResult {
    if (bytes.byteLength > artifactTextMaxBytes) {
        return tooLarge;
    }
    if (bytes.includes(0)) {
        return { status: 'binary' };
    }
    try {
        const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: bom === 'keep' });
        return { status: 'text', text: decoder.decode(bytes) };
    } catch {
        return { status: 'binary' };
    }
}

const tooLarge = { limit_bytes: artifactTextMaxBytes, status: 'too_large' } as const;
