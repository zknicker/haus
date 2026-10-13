import {
    type ArtifactPublishInput,
    artifactNameFromFilename,
    artifactNameMaxLength,
} from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactsTable as artifacts } from '../postgres/schema.ts';
import { ArtifactError } from './storage.ts';

const candidateBatch = 50;
const maxCandidates = 10_000;

/**
 * Picks the name for a new artifact. An explicit name must be free among live artifacts; without
 * one, the first free `<stem>`, `<stem>-2`, `<stem>-3`… derived from the filename wins.
 * Call inside the reservation transaction that holds the Server row lock: that lock serializes
 * every artifact insert for the Server, so the free name stays free until commit.
 */
export async function resolveNewArtifactName(
    tx: HausDatabase,
    serverId: string,
    input: Pick<ArtifactPublishInput, 'filename' | 'name'>
): Promise<string> {
    if (input.name) {
        const [taken] = await liveArtifactsNamed(tx, serverId, [input.name]);
        if (taken) {
            throw new ArtifactError(
                `\`${input.name}\` already exists (${taken.id}). Pass --artifact-id ${taken.id} to add a revision, or choose another name.`,
                409,
                'NAME_TAKEN'
            );
        }
        return input.name;
    }
    for (let start = 1; start <= maxCandidates; start += candidateBatch) {
        const candidates = Array.from({ length: candidateBatch }, (_, index) =>
            derivedName(input.filename, start + index)
        );
        const taken = new Set(
            (await liveArtifactsNamed(tx, serverId, candidates)).map((row) => row.name)
        );
        const free = candidates.find((candidate) => !taken.has(candidate));
        if (free) {
            return free;
        }
    }
    throw new ArtifactError(
        'No free artifact name remains for that filename. Pass --name.',
        409,
        'NAME_TAKEN'
    );
}

function derivedName(filename: string, attempt: number) {
    if (attempt === 1) {
        return artifactNameFromFilename(filename);
    }
    const suffix = `-${attempt}`;
    return `${artifactNameFromFilename(filename, artifactNameMaxLength - suffix.length)}${suffix}`;
}

async function liveArtifactsNamed(tx: HausDatabase, serverId: string, names: string[]) {
    return await tx
        .select({ id: artifacts.id, name: artifacts.name })
        .from(artifacts)
        .where(
            and(
                eq(artifacts.serverId, serverId),
                isNull(artifacts.deletedAt),
                inArray(artifacts.name, names)
            )
        );
}
